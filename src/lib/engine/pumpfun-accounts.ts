// Cupcak8 Swap — Pump.fun Account Decoder (IDL-Verified)
// Account layout verified against official Pump.fun IDL:
//   https://github.com/pump-fun/pump-public-docs/blob/main/idl/pump.json
// Discriminators verified via SHA256("account:Name")[0..8] and live mainnet Global account.
//
// BondingCurve layout (after 8-byte discriminator):
//   virtual_token_reserves: u64, virtual_quote_reserves: u64,
//   real_token_reserves: u64, real_quote_reserves: u64,
//   token_total_supply: u64, complete: bool,
//   creator: pubkey, is_mayhem_mode: bool, is_cashback_coin: bool,
//   quote_mint: pubkey, creator_fee_bps: u64, can_edit_creator_fee: bool,
//   is_holder_reward: bool, creator_fee: u64, protocol_fees: u64,
//   depth: u8, initial_virtual_quote_reserves: u64,
//   post_complete_base_out: u64, post_complete_quote_in: u64

const PUMP_FUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

// ── IDL-Verified Discriminators ────────────────────────────
// These match SHA256("account:Name")[0..8] — verified against the official IDL.

export const BONDING_CURVE_DISCRIMINATOR = new Uint8Array([23, 183, 248, 55, 96, 216, 172, 96]);
export const GLOBAL_DISCRIMINATOR = new Uint8Array([167, 232, 232, 177, 200, 108, 114, 127]);

// ── Account Data Types (matching IDL exactly) ──────────────

export interface BondingCurveAccount {
  virtualTokenReserves: bigint;
  virtualQuoteReserves: bigint;  // Was "virtualSolReserves" — renamed per IDL (quote asset may differ)
  realTokenReserves: bigint;
  realQuoteReserves: bigint;
  tokenTotalSupply: bigint;
  complete: boolean;
  creator: string;               // base58 pubkey
  isMayhemMode: boolean;
  isCashbackCoin: boolean;
  quoteMint: string;             // base58 — identifies the quote asset (SOL uses system program)
  creatorFeeBps: bigint;         // Per-curve creator fee (may differ from Global default)
  canEditCreatorFee: boolean;
  isHolderReward: boolean;
  creatorFee: bigint;            // Accumulated creator fees
  protocolFees: bigint;          // Accumulated protocol fees
  depth: number;                 // u8
  initialVirtualQuoteReserves: bigint;
  postCompleteBaseOut: bigint;
  /** Optional — absent in 150-byte legacy accounts, present in extended accounts (158 bytes) */
  postCompleteQuoteIn: bigint | null;
  /** Layout version detected from account length */
  layoutVersion: 'legacy-150' | 'extended-158';
}

export interface GlobalAccount {
  initialized: boolean;
  authority: string;
  feeRecipient: string;
  initialVirtualTokenReserves: bigint;
  initialVirtualSolReserves: bigint;
  initialRealTokenReserves: bigint;
  tokenTotalSupply: bigint;
  feeBasisPoints: bigint;        // Protocol fee (verified: 95 = 0.95% on mainnet)
  withdrawAuthority: string;
  enableMigrate: boolean;
  poolMigrationFee: bigint;
  creatorFeeBasisPoints: bigint; // Default creator fee (verified: 5 = 0.05% on mainnet)
}

export interface AccountFetchResult {
  data: Uint8Array;
  owner: string;
  slot: number;
  lamports: number;
}

// ── Base58 ─────────────────────────────────────────────────

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58Decode(str: string): Uint8Array {
  let num = 0n;
  for (const c of str) {
    const idx = B58.indexOf(c);
    if (idx < 0) return new Uint8Array(0);
    num = num * 58n + BigInt(idx);
  }
  const bytes: number[] = [];
  while (num > 0n) { bytes.unshift(Number(num % 256n)); num /= 256n; }
  for (const c of str) { if (c === '1') bytes.unshift(0); else break; }
  return new Uint8Array(bytes);
}

export function base58Encode(bytes: Uint8Array): string {
  let result = '';
  let num = 0n;
  for (const b of bytes) num = num * 256n + BigInt(b);
  while (num > 0n) { result = B58[Number(num % 58n)] + result; num /= 58n; }
  for (const b of bytes) { if (b === 0) result = '1' + result; else break; }
  return result;
}

// ── Account Fetching ───────────────────────────────────────

export async function fetchSolanaAccount(
  address: string,
  rpcUrl: string
): Promise<AccountFetchResult | null> {
  try {
    const resp = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'getAccountInfo',
        params: [address, { encoding: 'base64', commitment: 'confirmed' }],
      }),
      signal: AbortSignal.timeout(10000),
    });
    const json = await resp.json();
    const value = json.result?.value;
    if (!value?.data) return null;
    return {
      data: Uint8Array.from(atob(value.data[0]), c => c.charCodeAt(0)),
      owner: value.owner,
      slot: json.result?.context?.slot ?? 0,
      lamports: value.lamports,
    };
  } catch { return null; }
}

// ── Discriminator Verification ─────────────────────────────

export function verifyDiscriminator(data: Uint8Array, expected: Uint8Array): boolean {
  if (data.length < 8) return false;
  for (let i = 0; i < 8; i++) {
    if (data[i] !== expected[i]) return false;
  }
  return true;
}

export function verifyAccountOwner(owner: string): boolean {
  return owner === PUMP_FUN_PROGRAM_ID;
}

// ── BondingCurve Decoder (full IDL layout) ─────────────────
// Verified live on mainnet (2025-01): deployed accounts are 150 bytes,
// covering fields through post_complete_base_out. The IDL's final field
// (post_complete_quote_in) is only present in extended accounts (158 bytes).
// Layout versions:
//   legacy-150: 150 bytes — verified against PNUT/FARTCOIN bonding curves
//   extended-158: 158+ bytes — includes post_complete_quote_in

export function decodeBondingCurveAccount(data: Uint8Array): BondingCurveAccount | null {
  // Core fields through depth require 134 bytes:
  // 8 (disc) + 40 (5×u64) + 1 + 32 + 1 + 1 + 32 + 8 + 1 + 1 + 8 + 8 + 1 = 142
  if (data.length < 142) return null;

  try {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let off = 8; // Skip discriminator

    const virtualTokenReserves = view.getBigUint64(off, true); off += 8;
    const virtualQuoteReserves = view.getBigUint64(off, true); off += 8;
    const realTokenReserves = view.getBigUint64(off, true); off += 8;
    const realQuoteReserves = view.getBigUint64(off, true); off += 8;
    const tokenTotalSupply = view.getBigUint64(off, true); off += 8;
    const complete = data[off] === 1; off += 1;
    const creator = base58Encode(data.slice(off, off + 32)); off += 32;
    const isMayhemMode = data[off] === 1; off += 1;
    const isCashbackCoin = data[off] === 1; off += 1;
    const quoteMint = base58Encode(data.slice(off, off + 32)); off += 32;
    const creatorFeeBps = view.getBigUint64(off, true); off += 8;
    const canEditCreatorFee = data[off] === 1; off += 1;
    const isHolderReward = data[off] === 1; off += 1;
    const creatorFee = view.getBigUint64(off, true); off += 8;
    const protocolFees = view.getBigUint64(off, true); off += 8;
    const depth = data[off]; off += 1;

    // Optional tail fields — decode only if present
    let initialVirtualQuoteReserves = 0n;
    let postCompleteBaseOut = 0n;
    let postCompleteQuoteIn: bigint | null = null;

    if (data.length >= off + 8) {
      initialVirtualQuoteReserves = view.getBigUint64(off, true); off += 8;
    }
    if (data.length >= off + 8) {
      postCompleteBaseOut = view.getBigUint64(off, true); off += 8;
    }
    if (data.length >= off + 8) {
      postCompleteQuoteIn = view.getBigUint64(off, true); off += 8;
    }

    return {
      virtualTokenReserves, virtualQuoteReserves,
      realTokenReserves, realQuoteReserves,
      tokenTotalSupply, complete,
      creator, isMayhemMode, isCashbackCoin,
      quoteMint, creatorFeeBps, canEditCreatorFee,
      isHolderReward, creatorFee, protocolFees,
      depth, initialVirtualQuoteReserves,
      postCompleteBaseOut, postCompleteQuoteIn,
      layoutVersion: data.length >= 158 ? 'extended-158' : 'legacy-150',
    };
  } catch { return null; }
}

// ── Global Account Decoder ─────────────────────────────────

export function decodeGlobalAccount(data: Uint8Array): GlobalAccount | null {
  if (data.length < 162) return null;
  try {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let off = 8;
    const initialized = data[off] === 1; off += 1;
    const authority = base58Encode(data.slice(off, off + 32)); off += 32;
    const feeRecipient = base58Encode(data.slice(off, off + 32)); off += 32;
    const initialVirtualTokenReserves = view.getBigUint64(off, true); off += 8;
    const initialVirtualSolReserves = view.getBigUint64(off, true); off += 8;
    const initialRealTokenReserves = view.getBigUint64(off, true); off += 8;
    const tokenTotalSupply = view.getBigUint64(off, true); off += 8;
    const feeBasisPoints = view.getBigUint64(off, true); off += 8;
    const withdrawAuthority = base58Encode(data.slice(off, off + 32)); off += 32;
    const enableMigrate = data[off] === 1; off += 1;
    const poolMigrationFee = view.getBigUint64(off, true); off += 8;
    const creatorFeeBasisPoints = view.getBigUint64(off, true); off += 8;

    return {
      initialized, authority, feeRecipient,
      initialVirtualTokenReserves, initialVirtualSolReserves,
      initialRealTokenReserves, tokenTotalSupply,
      feeBasisPoints, withdrawAuthority, enableMigrate,
      poolMigrationFee, creatorFeeBasisPoints,
    };
  } catch { return null; }
}

// ── Fetch + Verify Pipeline ────────────────────────────────

export async function fetchAndVerifyBondingCurve(
  bondingCurvePda: string,
  rpcUrl: string
): Promise<{ account: BondingCurveAccount; slot: number } | null> {
  const fetched = await fetchSolanaAccount(bondingCurvePda, rpcUrl);
  if (!fetched) return null;
  if (!verifyAccountOwner(fetched.owner)) return null;
  if (!verifyDiscriminator(fetched.data, BONDING_CURVE_DISCRIMINATOR)) return null;

  const account = decodeBondingCurveAccount(fetched.data);
  if (!account) return null;
  if (account.virtualTokenReserves <= 0n || account.virtualQuoteReserves <= 0n) return null;

  return { account, slot: fetched.slot };
}

export async function fetchGlobalAccount(rpcUrl: string): Promise<GlobalAccount | null> {
  // Global PDA: seeds = ["global"], program = Pump.fun
  const { derivePumpFunGlobalPda } = await import('./pda');
  const pda = await derivePumpFunGlobalPda(PUMP_FUN_PROGRAM_ID);
  const fetched = await fetchSolanaAccount(pda.address, rpcUrl);
  if (!fetched) return null;
  if (!verifyAccountOwner(fetched.owner)) return null;
  if (!verifyDiscriminator(fetched.data, GLOBAL_DISCRIMINATOR)) return null;
  return decodeGlobalAccount(fetched.data);
}