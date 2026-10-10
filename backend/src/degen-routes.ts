// BSTONKEX Degen Mode — HTTP API route handlers
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  createSession, revokeSession, getSession, getSessionByWallet,
  getSessionStatus, executeDegenTrade, validateExecution,
  getAuditLog, getDegenStats, isGloballyDisabled, setGlobalDisabled,
  type ExecutionRequest, type DegenSession,
} from './degen-mode.js';

// ── Helpers ────────────────────────────────────────────────

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function getSessionJSON(s: DegenSession) {
  const status = getSessionStatus(s);
  const remaining = Math.max(0, s.maxSessionSpend - s.sessionSpent);
  const timeLeft = Math.max(0, s.expiresAt - Date.now());
  return {
    sessionId: s.sessionId,
    wallet: s.walletAddress,
    chain: s.chainId,
    status,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    timeRemainingMs: timeLeft,
    maxPerTrade: s.maxPerTrade,
    maxSessionSpend: s.maxSessionSpend,
    sessionSpent: s.sessionSpent,
    sessionRemaining: remaining,
    tradeCount: s.tradeCount,
    allowedTokens: s.allowedTokens,
    allowedContracts: s.allowedContracts,
    lastUsedAt: s.lastUsedAt,
  };
}

// ── Route Handlers ─────────────────────────────────────────

/** POST /degen/sessions — Create a new degen session */
export async function handleCreateSession(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = await readBody(req) as Record<string, unknown>;

    const walletAddress = String(body.walletAddress || '');
    const chainId = String(body.chainId || 'bsc') as any;
    const maxPerTrade = Number(body.maxPerTrade || 0);
    const maxSessionSpend = Number(body.maxSessionSpend || 0);
    const expiresInMinutes = Number(body.expiresInMinutes || 120);
    const allowedTokens = Array.isArray(body.allowedTokens) ? body.allowedTokens.map(String) : [];
    const allowedContracts = Array.isArray(body.allowedContracts) ? body.allowedContracts.map(String) : [];
    const authorization = String(body.authorization || '');

    const result = createSession({
      walletAddress, chainId, maxPerTrade, maxSessionSpend,
      expiresInMinutes, allowedTokens, allowedContracts, authorization,
    });

    if (!result.session) {
      json(res, 400, { error: result.error });
      return;
    }

    json(res, 201, { session: getSessionJSON(result.session) });
  } catch (e: any) {
    json(res, 500, { error: e.message || 'Internal error' });
  }
}

/** GET /degen/sessions/current?wallet=0x... — Get current session for wallet */
export async function handleGetCurrentSession(req: IncomingMessage, res: ServerResponse, url: URL) {
  const wallet = url.searchParams.get('wallet');
  if (!wallet) { json(res, 400, { error: 'wallet parameter required' }); return; }

  const session = getSessionByWallet(wallet);
  if (!session) { json(res, 404, { error: 'No active session' }); return; }

  json(res, 200, { session: getSessionJSON(session) });
}

/** GET /degen/sessions/:id — Get session by ID */
export async function handleGetSession(req: IncomingMessage, res: ServerResponse, sessionId: string) {
  const session = getSession(sessionId);
  if (!session) { json(res, 404, { error: 'Session not found' }); return; }

  json(res, 200, { session: getSessionJSON(session) });
}

/** POST /degen/sessions/:id/revoke — Revoke a session */
export async function handleRevokeSession(req: IncomingMessage, res: ServerResponse, sessionId: string) {
  try {
    const body = await readBody(req) as Record<string, unknown>;
    const wallet = String(body.walletAddress || '');

    const result = revokeSession(sessionId, wallet);
    if (!result.success) {
      json(res, 400, { error: result.error });
      return;
    }

    json(res, 200, { success: true, status: 'REVOKED' });
  } catch (e: any) {
    json(res, 500, { error: e.message || 'Internal error' });
  }
}

/** POST /degen/execute — Execute a degen trade */
export async function handleExecute(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = await readBody(req) as Record<string, unknown>;

    const execReq: ExecutionRequest = {
      sessionId: String(body.sessionId || ''),
      clientRequestId: String(body.clientRequestId || `req-${Date.now()}`),
      quoteId: String(body.quoteId || ''),
      token: String(body.token || ''),
      tokenSymbol: String(body.tokenSymbol || ''),
      side: (body.side === 'sell' ? 'sell' : 'buy') as 'buy' | 'sell',
      amount: Number(body.amount || 0),
      amountUsd: Number(body.amountUsd || 0),
      slippage: Number(body.slippage || 0.5),
      chainId: (body.chainId || 'bsc') as any,
      router: body.router ? String(body.router) : undefined,
    };

    // Validate clientRequestId
    if (!execReq.clientRequestId || execReq.clientRequestId.length < 3) {
      json(res, 400, { error: 'clientRequestId required' });
      return;
    }

    const result = executeDegenTrade(execReq);
    const status = result.success ? 200 : 403;
    json(res, status, result);
  } catch (e: any) {
    json(res, 500, { error: e.message || 'Internal error' });
  }
}

/** POST /degen/validate — Validate without executing */
export async function handleValidate(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = await readBody(req) as Record<string, unknown>;

    const execReq: ExecutionRequest = {
      sessionId: String(body.sessionId || ''),
      clientRequestId: String(body.clientRequestId || 'validate'),
      quoteId: String(body.quoteId || ''),
      token: String(body.token || ''),
      tokenSymbol: String(body.tokenSymbol || ''),
      side: (body.side === 'sell' ? 'sell' : 'buy') as 'buy' | 'sell',
      amount: Number(body.amount || 0),
      amountUsd: Number(body.amountUsd || 0),
      slippage: Number(body.slippage || 0.5),
      chainId: (body.chainId || 'bsc') as any,
    };

    const result = validateExecution(execReq);
    json(res, result.valid ? 200 : 403, result);
  } catch (e: any) {
    json(res, 500, { error: e.message || 'Internal error' });
  }
}

/** GET /degen/audit?sessionId=...&limit=50 — Get audit log */
export async function handleAudit(req: IncomingMessage, res: ServerResponse, url: URL) {
  const sessionId = url.searchParams.get('sessionId') || undefined;
  const limit = parseInt(url.searchParams.get('limit') || '50');
  json(res, 200, { events: getAuditLog(sessionId, limit) });
}

/** GET /degen/stats — Get monitoring stats */
export async function handleStats(_req: IncomingMessage, res: ServerResponse) {
  json(res, 200, getDegenStats());
}

/** POST /degen/kill-switch — Emergency disable (admin only) */
export async function handleKillSwitch(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = await readBody(req) as Record<string, unknown>;
    const disabled = Boolean(body.disabled);
    setGlobalDisabled(disabled);
    json(res, 200, { globallyDisabled: disabled });
  } catch (e: any) {
    json(res, 500, { error: e.message || 'Internal error' });
  }
}

// ── Router ─────────────────────────────────────────────────

export function routeDegen(req: IncomingMessage, res: ServerResponse, url: URL): boolean {
  const path = url.pathname;
  const method = req.method || 'GET';

  // POST /degen/sessions
  if (method === 'POST' && path === '/degen/sessions') {
    handleCreateSession(req, res);
    return true;
  }

  // GET /degen/sessions/current
  if (method === 'GET' && path === '/degen/sessions/current') {
    handleGetCurrentSession(req, res, url);
    return true;
  }

  // GET /degen/sessions/:id
  if (method === 'GET' && path.startsWith('/degen/sessions/') && !path.includes('/revoke')) {
    const sessionId = path.split('/degen/sessions/')[1];
    handleGetSession(req, res, sessionId);
    return true;
  }

  // POST /degen/sessions/:id/revoke
  if (method === 'POST' && path.endsWith('/revoke') && path.startsWith('/degen/sessions/')) {
    const sessionId = path.split('/degen/sessions/')[1].replace('/revoke', '');
    handleRevokeSession(req, res, sessionId);
    return true;
  }

  // POST /degen/execute
  if (method === 'POST' && path === '/degen/execute') {
    handleExecute(req, res);
    return true;
  }

  // POST /degen/validate
  if (method === 'POST' && path === '/degen/validate') {
    handleValidate(req, res);
    return true;
  }

  // GET /degen/audit
  if (method === 'GET' && path === '/degen/audit') {
    handleAudit(req, res, url);
    return true;
  }

  // GET /degen/stats
  if (method === 'GET' && path === '/degen/stats') {
    handleStats(req, res);
    return true;
  }

  // POST /degen/kill-switch
  if (method === 'POST' && path === '/degen/kill-switch') {
    handleKillSwitch(req, res);
    return true;
  }

  return false;
}