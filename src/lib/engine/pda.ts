// Cupcak8 Swap — Solana PDA Derivation (pure, no external deps)
// Implements the standard Solana Program Derived Address algorithm.
// Reference: https://solanacookbook.com/references/accounts.html#program-derived-addresses
//
// PDA = findProgramAddressSync(seeds, programId)
// For bump in [255, 0]:
//   hash = SHA256(seeds[0] || seeds[1] || ... || bump || programId || "ProgramDerivedAddress")
//   if hash is NOT a valid ed25519 point → return (hash, bump)

const PDA_MARKER = 'ProgramDerivedAddress';

// ── SHA-256 (Web Crypto) ───────────────────────────────────

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest('SHA-256', data as unknown as BufferSource);
  return new Uint8Array(hash);
}

// ── Ed25519 Point-on-Curve Check ───────────────────────────
// A point P = (x, y) is on the twisted Edwards curve if:
//   -x^2 + y^2 = 1 + d * x^2 * y^2  (mod p)
// where d = -121665/121666 and p = 2^255 - 19
//
// We attempt to decompress the y-coordinate + sign bit.
// If decompression yields a valid x, the point IS on the curve (invalid PDA).
// If decompression fails (x^2 is not a QR mod p), the point is off-curve (valid PDA).

const P = 2n ** 255n - 19n;
// d = -121665 * modInverse(121666, p) mod p
// Precomputed: d = 37095705934669439343138083508754565189542113879843219016388785533085940283555n
const D = 37095705934669439343138083508754565189542113879843219016388785533085940283555n;

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp % 2n === 1n) result = (result * base) % mod;
    exp = exp / 2n;
    base = (base * base) % mod;
  }
  return result;
}

function modInverse(a: bigint, mod: bigint): bigint {
  // Fermat's little theorem: a^(p-2) mod p = a^(-1) mod p when p is prime
  return modPow((a % mod + mod) % mod, mod - 2n, mod);
}

/** Check if a 32-byte value is a valid ed25519 point (on-curve) */
export function isOnCurve(bytes: Uint8Array): boolean {
  if (bytes.length !== 32) return false;

  // Decode y-coordinate from little-endian bytes
  let y = 0n;
  for (let i = 31; i >= 0; i--) {
    y = (y << 8n) | BigInt(bytes[i]);
  }

  // Extract sign bit (bit 255) and clear it from y
  const sign = y >> 255n;
  y &= (1n << 255n) - 1n;

  // Compute x^2 = (y^2 - 1) / (d * y^2 + 1)  mod p
  const y2 = (y * y) % P;
  const numerator = (y2 - 1n + P) % P;
  const denominator = (D * y2 + 1n) % P;
  const invDenom = modInverse(denominator, P);
  const x2 = (numerator * invDenom) % P;

  // Check if x2 is a quadratic residue (has a square root mod p)
  // Euler's criterion: x2^((p-1)/2) mod p == 1
  const legendre = modPow(x2, (P - 1n) / 2n, P);

  if (legendre === 1n) return true; // On curve
  if (x2 === 0n && sign === 0n) return true; // Edge case: x=0
  return false; // Off curve (valid PDA candidate)
}

// ── PDA Derivation ─────────────────────────────────────────

export interface PdaResult {
  address: string; // Base58 encoded
  bump: number;
}

/** Base58 encode */
function base58Encode(bytes: Uint8Array): string {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let result = '';
  let num = 0n;
  for (const b of bytes) {
    num = num * 256n + BigInt(b);
  }
  while (num > 0n) {
    result = ALPHABET[Number(num % 58n)] + result;
    num /= 58n;
  }
  // Leading zeros
  for (const b of bytes) {
    if (b === 0) result = '1' + result;
    else break;
  }
  return result;
}

/** Base58 decode */
export function base58Decode(str: string): Uint8Array {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let num = 0n;
  for (const c of str) {
    const idx = ALPHABET.indexOf(c);
    if (idx < 0) throw new Error(`Invalid base58 character: ${c}`);
    num = num * 58n + BigInt(idx);
  }
  const bytes: number[] = [];
  while (num > 0n) {
    bytes.unshift(Number(num % 256n));
    num /= 256n;
  }
  // Leading '1' = leading zero bytes
  for (const c of str) {
    if (c === '1') bytes.unshift(0);
    else break;
  }
  return new Uint8Array(bytes);
}

/**
 * Derive a Program Derived Address.
 * @param seeds - Array of seed buffers (each must be ≤ 32 bytes)
 * @param programId - Base58 program ID string
 * @returns PDA address (base58) and bump seed
 */
export async function findProgramAddress(seeds: Uint8Array[], programId: string): Promise<PdaResult> {
  const programIdBytes = base58Decode(programId);
  const markerBytes = new TextEncoder().encode(PDA_MARKER);

  // Concatenate seeds
  for (const seed of seeds) {
    if (seed.length > 32) throw new Error('Seed exceeds 32 bytes');
  }

  for (let bump = 255; bump >= 0; bump--) {
    const bumpByte = new Uint8Array([bump]);

    // Build input: seeds || bump || programId || "ProgramDerivedAddress"
    let totalLen = bumpByte.length + programIdBytes.length + markerBytes.length;
    for (const seed of seeds) totalLen += seed.length;

    const input = new Uint8Array(totalLen);
    let offset = 0;
    for (const seed of seeds) {
      input.set(seed, offset);
      offset += seed.length;
    }
    input.set(bumpByte, offset);
    offset += bumpByte.length;
    input.set(programIdBytes, offset);
    offset += programIdBytes.length;
    input.set(markerBytes, offset);

    const hash = await sha256(input);

    // If hash is OFF curve, this is a valid PDA
    if (!isOnCurve(hash)) {
      return { address: base58Encode(hash), bump };
    }
  }

  throw new Error('Unable to find valid PDA bump');
}

/**
 * Convenience: derive Pump.fun bonding curve PDA for a token mint.
 * Seeds: ["bonding-curve", mintPubkey] (verified against IDL)
 */
export async function derivePumpFunBondingCurvePda(
  mintAddress: string,
  programId: string
): Promise<PdaResult> {
  const seedStr = new TextEncoder().encode('bonding-curve');
  const mintBytes = base58Decode(mintAddress);
  return findProgramAddress([seedStr, mintBytes], programId);
}

/**
 * Derive Pump.fun Global state PDA.
 * Seeds: ["global"] (verified against IDL)
 */
export async function derivePumpFunGlobalPda(programId: string): Promise<PdaResult> {
  const seedStr = new TextEncoder().encode('global');
  return findProgramAddress([seedStr], programId);
}