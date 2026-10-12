// Cupcak8 Swap Reward API Client — authenticated requests to Railway backend
// Wallet identity comes from session token, never from request body.

import type {
  AuthNonce, AuthSession, BackendRewardSummary,
  CashbackRecord, ReferralRecord, ClaimRecord, ClaimRequestResult,
} from './reward-types';

const API_BASE = 'https://api.bstonkex.xyz';

let sessionToken: string | null = null;

export function getSessionToken(): string | null { return sessionToken; }
export function setSessionToken(t: string | null): void { sessionToken = t; }
export function isAuthenticated(): boolean { return sessionToken !== null; }

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

// ── Auth ──────────────────────────────────────────────────────

export async function fetchNonce(walletAddress: string): Promise<AuthNonce> {
  return request<AuthNonce>('/auth/nonce', {
    method: 'POST',
    body: JSON.stringify({ walletAddress }),
  });
}

export async function verifySignatureAndLogin(
  walletAddress: string, nonce: string, signature: string
): Promise<AuthSession> {
  const session = await request<AuthSession>('/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ walletAddress, nonce, signature }),
  });
  sessionToken = session.token;
  return session;
}

export function logout(): void { sessionToken = null; }

// ── Rewards (session-authenticated) ──────────────────────────

export async function fetchSummary(): Promise<BackendRewardSummary> {
  return request<BackendRewardSummary>('/rewards/summary');
}

export async function fetchCashback(): Promise<CashbackRecord[]> {
  const { records } = await request<{ records: CashbackRecord[] }>('/rewards/cashback');
  return records;
}

export async function fetchReferrals(): Promise<ReferralRecord[]> {
  const { records } = await request<{ records: ReferralRecord[] }>('/rewards/referral');
  return records;
}

export async function fetchClaims(): Promise<ClaimRecord[]> {
  const { records } = await request<{ records: ClaimRecord[] }>('/rewards/claims');
  return records;
}

export async function submitClaim(claimType: 'cashback' | 'referral' | 'combined'): Promise<ClaimRequestResult> {
  return request<ClaimRequestResult>('/rewards/claim', {
    method: 'POST',
    body: JSON.stringify({ claimType }),
  });
}
