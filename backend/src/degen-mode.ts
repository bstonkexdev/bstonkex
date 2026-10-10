// BSTONKEX Degen Mode — Server-side session management, validation, audit
// Non-custodial: NO private keys, NO seed phrases stored

// ChainId duplicated here to avoid cross-project import issues
type ChainId = 'bsc' | 'solana' | 'base' | 'robinhood';

// ── Types ──────────────────────────────────────────────────

export type SessionStatus = 'pending' | 'active' | 'expiring' | 'expired' | 'revoked' | 'suspended';
export type EventType = 'SESSION_CREATED' | 'SESSION_AUTHORIZED' | 'SESSION_USED' | 'TRADE_ACCEPTED' | 'TRADE_REJECTED' | 'LIMIT_REJECTED' | 'SESSION_REVOKED' | 'SESSION_EXPIRED' | 'EXECUTION_FAILED' | 'GLOBAL_DISABLE';

export interface DegenSession {
  sessionId: string;
  walletAddress: string;
  chainId: ChainId;
  status: SessionStatus;
  createdAt: number;
  expiresAt: number;
  maxPerTrade: number;
  maxSessionSpend: number;
  sessionSpent: number;
  allowedTokens: string[];
  allowedContracts: string[];
  allowedRouters: string[];
  tradeCount: number;
  revokedAt: number | null;
  lastUsedAt: number | null;
  nonce: number;
}

export interface SessionEvent {
  id: string;
  timestamp: number;
  sessionId: string;
  walletAddress: string;
  chainId: ChainId;
  eventType: EventType;
  clientRequestId?: string;
  transactionHash?: string;
  reason?: string;
  amount?: number;
  tokenSymbol?: string;
}

export interface ExecutionRequest {
  sessionId: string;
  clientRequestId: string;
  quoteId: string;
  token: string;
  tokenSymbol: string;
  side: 'buy' | 'sell';
  amount: number;
  amountUsd: number;
  slippage: number;
  chainId: ChainId;
  router?: string;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  session?: DegenSession;
}

export interface ExecutionResult {
  success: boolean;
  status: string;
  transactionHash?: string;
  error?: string;
  executionId?: string;
}

// ── In-memory stores (production: use Redis/DB) ────────────

const sessions = new Map<string, DegenSession>();
const events: SessionEvent[] = [];
const processedRequests = new Map<string, ExecutionResult>(); // idempotency
const rateLimits = new Map<string, { count: number; resetAt: number }>();

// ── Global kill switch ─────────────────────────────────────

let globalDisabled = false;

export function isGloballyDisabled(): boolean { return globalDisabled; }
export function setGlobalDisabled(disabled: boolean): void {
  globalDisabled = disabled;
  if (disabled) {
    logEvent({
      sessionId: 'SYSTEM', walletAddress: '', chainId: 'bsc',
      eventType: 'GLOBAL_DISABLE', reason: 'Emergency kill switch activated',
    });
  }
}

// ── Constants ──────────────────────────────────────────────

const MAX_SESSION_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours max
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const MAX_EXECUTIONS_PER_MINUTE = 10;
const MAX_SESSIONS_PER_WALLET = 1;

const ALLOWED_ROUTERS: Record<string, string[]> = {
  bsc: ['0x10ED43C718714eb63d5aA57B78B54704E256024E', '0x3a8d52AbE3aE5B5E4f56DbC5D9c4D3a5b5b5b5b5'],
  base: ['0x2626664c2603336E57B271c5C0b26F421741e481'],
  solana: ['JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'],
  robinhood: [],
};

const ALLOWED_TOKENS_DEFAULT: string[] = []; // empty = all tokens allowed

// ── Session Management ─────────────────────────────────────

export function createSession(params: {
  walletAddress: string;
  chainId: ChainId;
  maxPerTrade: number;
  maxSessionSpend: number;
  expiresInMinutes: number;
  allowedTokens?: string[];
  allowedContracts?: string[];
  authorization: string; // wallet signature or session key reference
}): { session: DegenSession | null; error?: string } {
  // Validate
  if (globalDisabled) return { session: null, error: 'DEGEN MODE GLOBALLY DISABLED' };
  if (!params.walletAddress || params.walletAddress.length < 10) return { session: null, error: 'INVALID WALLET' };
  if (params.maxPerTrade <= 0 || params.maxSessionSpend <= 0) return { session: null, error: 'INVALID LIMITS' };
  if (params.maxPerTrade > params.maxSessionSpend) return { session: null, error: 'MAX/TRADE EXCEEDS MAX/SESSION' };
  if (params.expiresInMinutes <= 0 || params.expiresInMinutes * 60_000 > MAX_SESSION_DURATION_MS) return { session: null, error: 'INVALID EXPIRATION' };
  if (!params.authorization) return { session: null, error: 'AUTHORIZATION REQUIRED' };

  // Rate limit
  const rateKey = `create:${params.walletAddress}`;
  if (!checkRateLimit(rateKey, 3)) return { session: null, error: 'RATE LIMITED' };

  // Max sessions per wallet
  const existing = Array.from(sessions.values()).find(
    s => s.walletAddress.toLowerCase() === params.walletAddress.toLowerCase() && s.status === 'active'
  );
  if (existing) return { session: null, error: 'ACTIVE SESSION EXISTS' };

  const sessionId = `degen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();

  const session: DegenSession = {
    sessionId,
    walletAddress: params.walletAddress,
    chainId: params.chainId,
    status: 'active',
    createdAt: now,
    expiresAt: now + params.expiresInMinutes * 60_000,
    maxPerTrade: params.maxPerTrade,
    maxSessionSpend: params.maxSessionSpend,
    sessionSpent: 0,
    allowedTokens: params.allowedTokens?.length ? params.allowedTokens : [],
    allowedContracts: params.allowedContracts?.length ? params.allowedContracts : (ALLOWED_ROUTERS[params.chainId] || []),
    allowedRouters: ALLOWED_ROUTERS[params.chainId] || [],
    tradeCount: 0,
    revokedAt: null,
    lastUsedAt: null,
    nonce: 0,
  };

  sessions.set(sessionId, session);
  logEvent({
    sessionId, walletAddress: params.walletAddress, chainId: params.chainId,
    eventType: 'SESSION_CREATED', reason: `Limits: ${params.maxPerTrade}/trade, ${params.maxSessionSpend}/session, ${params.expiresInMinutes}min`,
  });
  logEvent({
    sessionId, walletAddress: params.walletAddress, chainId: params.chainId,
    eventType: 'SESSION_AUTHORIZED',
  });

  return { session };
}

export function revokeSession(sessionId: string, walletAddress: string): { success: boolean; error?: string } {
  const session = sessions.get(sessionId);
  if (!session) return { success: false, error: 'SESSION NOT FOUND' };
  if (session.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) return { success: false, error: 'WALLET MISMATCH' };
  if (session.status === 'revoked') return { success: false, error: 'ALREADY REVOKED' };

  session.status = 'revoked';
  session.revokedAt = Date.now();
  logEvent({
    sessionId, walletAddress, chainId: session.chainId,
    eventType: 'SESSION_REVOKED',
  });
  return { success: true };
}

export function getSession(sessionId: string): DegenSession | null {
  return sessions.get(sessionId) || null;
}

export function getSessionByWallet(walletAddress: string): DegenSession | null {
  return Array.from(sessions.values()).find(
    s => s.walletAddress.toLowerCase() === walletAddress.toLowerCase() && s.status === 'active'
  ) || null;
}

export function getSessionStatus(session: DegenSession): SessionStatus {
  if (session.status === 'revoked') return 'revoked';
  if (session.status === 'suspended') return 'suspended';
  if (Date.now() > session.expiresAt) {
    if (session.status === 'active') {
      session.status = 'expired';
      logEvent({
        sessionId: session.sessionId, walletAddress: session.walletAddress, chainId: session.chainId,
        eventType: 'SESSION_EXPIRED',
      });
    }
    return 'expired';
  }
  // Warn if expiring soon (5 min)
  if (session.status === 'active' && session.expiresAt - Date.now() < 5 * 60_000) {
    return 'expiring';
  }
  return session.status;
}

// ── Validation ─────────────────────────────────────────────

export function validateExecution(req: ExecutionRequest): ValidationResult {
  // Global check
  if (globalDisabled) return { valid: false, reason: 'DEGEN MODE GLOBALLY DISABLED' };

  // Session exists
  const session = sessions.get(req.sessionId);
  if (!session) return { valid: false, reason: 'SESSION NOT FOUND' };

  // Session active
  const status = getSessionStatus(session);
  if (status !== 'active' && status !== 'expiring') {
    return { valid: false, reason: `SESSION ${status.toUpperCase()}` };
  }

  // Wallet matches
  // (In production, wallet is verified via signature; here we check session binding)
  if (!session.walletAddress) return { valid: false, reason: 'NO WALLET BOUND' };

  // Chain matches
  if (session.chainId !== req.chainId) return { valid: false, reason: 'CHAIN NOT AUTHORIZED' };

  // Token check
  if (session.allowedTokens.length > 0 && !session.allowedTokens.includes(req.token)) {
    return { valid: false, reason: 'TOKEN NOT AUTHORIZED' };
  }

  // Router check (if specified)
  if (req.router && session.allowedRouters.length > 0 && !session.allowedRouters.includes(req.router)) {
    return { valid: false, reason: 'ROUTER NOT AUTHORIZED' };
  }

  // Per-trade limit
  if (req.amount > session.maxPerTrade) {
    logEvent({
      sessionId: session.sessionId, walletAddress: session.walletAddress, chainId: session.chainId,
      eventType: 'LIMIT_REJECTED', reason: `MAX/TRADE: ${req.amount} > ${session.maxPerTrade}`,
      clientRequestId: req.clientRequestId, amount: req.amount, tokenSymbol: req.tokenSymbol,
    });
    return { valid: false, reason: `MAX / TRADE EXCEEDED (${session.maxPerTrade} limit)` };
  }

  // Session spending limit
  if (session.sessionSpent + req.amount > session.maxSessionSpend) {
    logEvent({
      sessionId: session.sessionId, walletAddress: session.walletAddress, chainId: session.chainId,
      eventType: 'LIMIT_REJECTED', reason: `SESSION LIMIT: ${session.sessionSpent + req.amount} > ${session.maxSessionSpend}`,
      clientRequestId: req.clientRequestId, amount: req.amount, tokenSymbol: req.tokenSymbol,
    });
    return { valid: false, reason: `SESSION LIMIT EXCEEDED (${(session.maxSessionSpend - session.sessionSpent).toFixed(4)} remaining)` };
  }

  // Slippage check (max 50%)
  if (req.slippage > 50) return { valid: false, reason: 'SLIPPAGE TOO HIGH' };

  // Quote ID required (frontend must re-verify quote freshness before calling)
  if (!req.quoteId || req.quoteId.length < 3) return { valid: false, reason: 'QUOTE ID REQUIRED' };

  // clientRequestId required for idempotency
  if (!req.clientRequestId || req.clientRequestId.length < 3) return { valid: false, reason: 'CLIENT REQUEST ID REQUIRED' };

  return { valid: true, session };
}

// ── Execution ──────────────────────────────────────────────

export function executeDegenTrade(req: ExecutionRequest): ExecutionResult {
  // Idempotency check
  const existing = processedRequests.get(req.clientRequestId);
  if (existing) return existing;

  // Validate
  const validation = validateExecution(req);
  if (!validation.valid || !validation.session) {
    const result: ExecutionResult = { success: false, status: 'REJECTED', error: validation.reason };
    processedRequests.set(req.clientRequestId, result);
    logEvent({
      sessionId: req.sessionId, walletAddress: '', chainId: req.chainId,
      eventType: 'TRADE_REJECTED', reason: validation.reason,
      clientRequestId: req.clientRequestId, amount: req.amount, tokenSymbol: req.tokenSymbol,
    });
    return result;
  }

  const session = validation.session;

  // Rate limit per wallet
  const rateKey = `exec:${session.walletAddress}`;
  if (!checkRateLimit(rateKey, MAX_EXECUTIONS_PER_MINUTE)) {
    const result: ExecutionResult = { success: false, status: 'RATE_LIMITED', error: 'EXECUTION RATE LIMITED' };
    processedRequests.set(req.clientRequestId, result);
    return result;
  }

  // Atomic spending update (in production: use Redis INCRBY or DB transaction)
  session.sessionSpent += req.amount;
  session.tradeCount += 1;
  session.nonce += 1;
  session.lastUsedAt = Date.now();

  // In production: submit to blockchain via execution engine
  // For now: mark as authorized and return pending
  const executionId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const result: ExecutionResult = {
    success: true,
    status: 'AUTHORIZED',
    executionId,
  };

  processedRequests.set(req.clientRequestId, result);
  logEvent({
    sessionId: session.sessionId, walletAddress: session.walletAddress, chainId: session.chainId,
    eventType: 'TRADE_ACCEPTED', clientRequestId: req.clientRequestId,
    amount: req.amount, tokenSymbol: req.tokenSymbol,
  });

  return result;
}

// ── Audit Log ──────────────────────────────────────────────

function logEvent(params: Omit<SessionEvent, 'id' | 'timestamp'>): void {
  events.push({
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    ...params,
  });
  // Keep last 1000 events
  if (events.length > 1000) events.splice(0, events.length - 1000);
}

export function getAuditLog(sessionId?: string, limit = 50): SessionEvent[] {
  const filtered = sessionId ? events.filter(e => e.sessionId === sessionId) : events;
  return filtered.slice(-limit).reverse();
}

export function getSessionEvents(sessionId: string): SessionEvent[] {
  return events.filter(e => e.sessionId === sessionId);
}

// ── Rate Limiting ──────────────────────────────────────────

function checkRateLimit(key: string, maxPerWindow: number): boolean {
  const now = Date.now();
  const entry = rateLimits.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= maxPerWindow) return false;
  entry.count++;
  return true;
}

// ── Monitoring ─────────────────────────────────────────────

export function getDegenStats() {
  const activeSessions = Array.from(sessions.values()).filter(s => getSessionStatus(s) === 'active' || getSessionStatus(s) === 'expiring');
  const totalSessions = sessions.size;
  const totalExecutions = processedRequests.size;
  const successfulExecutions = Array.from(processedRequests.values()).filter(r => r.success).length;
  const failedExecutions = totalExecutions - successfulExecutions;
  const totalSpent = activeSessions.reduce((s, sess) => s + sess.sessionSpent, 0);

  return {
    globallyDisabled: globalDisabled,
    activeSessions: activeSessions.length,
    totalSessions,
    totalExecutions,
    successfulExecutions,
    failedExecutions,
    totalSpent,
    recentEvents: events.slice(-10).reverse(),
  };
}