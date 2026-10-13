// Cupcak8 Swap — Bonding Curve Pricing Engine (IDL-Verified)
// Account layout, fees, and discriminators verified against official Pump.fun IDL:
//   https://github.com/pump-fun/pump-public-docs/blob/main/idl/pump.json
// Verified live: Global account at 4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf
//   fee_basis_points = 95 (0.95%), creator_fee_basis_points = 5 (0.05%)
import type { ChainId } from '../config';
import { derivePumpFunBondingCurvePda } from './pda';
import {
  fetchAndVerifyBondingCurve,
  fetchGlobalAccount,
  type GlobalAccount,
} from './pumpfun-accounts';
import { getSolUsdPrice } from './sol-price';

// ── Types ──────────────────────────────────────────────────

export interface BondingCurveState {
  virtualQuoteReserves: number; // lamports (or quote asset base units)
  virtualTokenReserves: number;
  realQuoteReserves: number;
  realTokenReserves: number;
  tokenDecimals: number;
  completionRatio: number;
  isComplete: boolean;
  /** Spot price in SOL per token. NULL for non-SOL quote mints — never fabricated. */
  spotPriceSol: number | null;
  /** Spot price in USD. NULL when SOL/USD is stale/unavailable or quote is non-SOL. */
  spotPriceUsd: number | null;
  solUsdPrice: number | null;
  solUsdFresh: boolean;
  slot: number;
  observedAt: number;
  bondingCurvePda: string;
  bump: number;
  /** Quote mint (base58). System program = SOL. */
  quoteMint: string;
  /** Whether quote asset is SOL */
  isSolQuote: boolean;
  /** Per-curve creator fee (bps) */
  creatorFeeBps: number;
  /** Protocol fee (bps) from Global */
  protocolFeeBps: number;
  /** Creator address */
  creator: string;
}

export interface BondingCurveQuote {
  priceSol: number;
  priceUsd: number | null;
  solAmount: number;
  priceImpact: number;
  referenceSpotPriceSol: number;
  executable: boolean;
  stateAge: number;
  minOut: number;
  slippageBps: number;
  /** Fee breakdown */
  protocolFee: number;
  creatorFee: number;
  totalFeeBps: number;
}

export interface BondingCurveAdapter {
  id: string;
  chainId: ChainId;
  getCurveState(tokenMint: string): Promise<BondingCurveState | null>;
  getBuyQuote(tokenMint: string, solAmount: number, slippageBps?: number): Promise<BondingCurveQuote | null>;
  getSellQuote(tokenMint: string, tokenAmount: number, slippageBps?: number): Promise<BondingCurveQuote | null>;
}

// ── Constants ──────────────────────────────────────────────

const PUMP_FUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';
const SYSTEM_PROGRAM = '11111111111111111111111111111111'; // SOL quote mint
const TOKEN_DECIMALS = 6;

// ── Global Account Cache ───────────────────────────────────

let globalCache: { account: GlobalAccount; fetchedAt: number } | null = null;
const GLOBAL_CACHE_TTL = 60_000; // 1 minute

async function getGlobalParams(): Promise<{ feeBps: number; creatorFeeBps: number; initialVirtualToken: bigint; initialVirtualSol: bigint; initialRealToken: bigint } | null> {
  const now = Date.now();
  if (globalCache && now - globalCache.fetchedAt < GLOBAL_CACHE_TTL) {
    const g = globalCache.account;
    return {
      feeBps: Number(g.feeBasisPoints),
      creatorFeeBps: Number(g.creatorFeeBasisPoints),
      initialVirtualToken: g.initialVirtualTokenReserves,
      initialVirtualSol: g.initialVirtualSolReserves,
      initialRealToken: g.initialRealTokenReserves,
    };
  }

  try {
    const g = await fetchGlobalAccount(SOLANA_RPC);
    if (!g) return null;
    globalCache = { account: g, fetchedAt: now };
    return {
      feeBps: Number(g.feeBasisPoints),
      creatorFeeBps: Number(g.creatorFeeBasisPoints),
      initialVirtualToken: g.initialVirtualTokenReserves,
      initialVirtualSol: g.initialVirtualSolReserves,
      initialRealToken: g.initialRealTokenReserves,
    };
  } catch {
    return globalCache ? {
      feeBps: Number(globalCache.account.feeBasisPoints),
      creatorFeeBps: Number(globalCache.account.creatorFeeBasisPoints),
      initialVirtualToken: globalCache.account.initialVirtualTokenReserves,
      initialVirtualSol: globalCache.account.initialVirtualSolReserves,
      initialRealToken: globalCache.account.initialRealTokenReserves,
    } : null;
  }
}

// ── PDA Cache ──────────────────────────────────────────────

const pdaCache = new Map<string, { address: string; bump: number }>();

async function getBondingCurvePda(mint: string): Promise<{ address: string; bump: number }> {
  const key = mint.toLowerCase();
  const cached = pdaCache.get(key);
  if (cached) return cached;
  const result = await derivePumpFunBondingCurvePda(mint, PUMP_FUN_PROGRAM_ID);
  pdaCache.set(key, result);
  return result;
}

// ── Integer Math (BigInt constant product) ─────────────────

function calcBuyTokensOut(
  virtualQuote: bigint,
  virtualToken: bigint,
  quoteLamportsIn: bigint,
  protocolFeeBps: number,
  creatorFeeBps: number
): { tokensOut: bigint; feeAmount: bigint; protocolFee: bigint; creatorFee: bigint } {
  const protocolFee = (quoteLamportsIn * BigInt(protocolFeeBps)) / 10000n;
  const creatorFee = (quoteLamportsIn * BigInt(creatorFeeBps)) / 10000n;
  const totalFee = protocolFee + creatorFee;
  const afterFee = quoteLamportsIn - totalFee;
  if (afterFee <= 0n) return { tokensOut: 0n, feeAmount: totalFee, protocolFee, creatorFee };

  const k = virtualQuote * virtualToken;
  const newVirtualQuote = virtualQuote + afterFee;
  const newVirtualToken = k / newVirtualQuote;
  const tokensOut = virtualToken - newVirtualToken;
  return { tokensOut, feeAmount: totalFee, protocolFee, creatorFee };
}

function calcSellQuoteOut(
  virtualQuote: bigint,
  virtualToken: bigint,
  tokenUnitsIn: bigint,
  protocolFeeBps: number,
  creatorFeeBps: number
): { quoteOut: bigint; feeAmount: bigint; protocolFee: bigint; creatorFee: bigint } {
  const k = virtualQuote * virtualToken;
  const newVirtualToken = virtualToken + tokenUnitsIn;
  const newVirtualQuote = k / newVirtualToken;
  const grossQuoteOut = virtualQuote - newVirtualQuote;
  if (grossQuoteOut <= 0n) return { quoteOut: 0n, feeAmount: 0n, protocolFee: 0n, creatorFee: 0n };

  const protocolFee = (grossQuoteOut * BigInt(protocolFeeBps)) / 10000n;
  const creatorFee = (grossQuoteOut * BigInt(creatorFeeBps)) / 10000n;
  const totalFee = protocolFee + creatorFee;
  const quoteOut = grossQuoteOut - totalFee;
  return { quoteOut, feeAmount: totalFee, protocolFee, creatorFee };
}

// ── Adapter ────────────────────────────────────────────────

export function createPumpFunBondingCurveAdapter(): BondingCurveAdapter {
  return {
    id: 'pumpfun-bonding-curve',
    chainId: 'solana',

    async getCurveState(tokenMint: string): Promise<BondingCurveState | null> {
      try {
        const pda = await getBondingCurvePda(tokenMint);
        const verified = await fetchAndVerifyBondingCurve(pda.address, SOLANA_RPC);
        if (!verified) return null;
        const { account, slot } = verified;

        const globals = await getGlobalParams();
        const protocolFeeBps = globals?.feeBps ?? 95;
        const defaultCreatorFeeBps = globals?.creatorFeeBps ?? 5;
        const creatorFeeBps = account.creatorFeeBps > 0n ? Number(account.creatorFeeBps) : defaultCreatorFeeBps;

        const vToken = Number(account.virtualTokenReserves);
        const vQuote = Number(account.virtualQuoteReserves);
        const rToken = Number(account.realTokenReserves);
        const rQuote = Number(account.realQuoteReserves);
        if (vToken <= 0) return null;

        // Spot price = (virtualQuote in SOL) / (virtualToken in whole tokens).
        // Verified live against mainnet TradeEvent at slot 456290937:
        //   virtual_sol=30 SOL, virtual_token=1.073e9 tokens → 2.7959e-8 SOL/token.
        // vQuote is in lamports (1e9 = 1 SOL); vToken is in raw units (1e6 = 1 token).
        // For non-SOL quote mints the quote unit is unknown → pricing explicitly
        // unavailable (null). Never substitute zero or a SOL-denominated value.
        const isSolQuote = account.quoteMint === SYSTEM_PROGRAM;
        let spotPriceSol: number | null = null;
        let spotPriceUsd: number | null = null;
        let solUsdPrice: number | null = null;
        let solUsdFresh = false;
        if (isSolQuote) {
          spotPriceSol = (vQuote / 1e9) / (vToken / 1e6);
          const solPrice = await getSolUsdPrice();
          solUsdPrice = solPrice.priceUsd;
          solUsdFresh = solPrice.isFresh;
          spotPriceUsd = solPrice.isFresh && solPrice.priceUsd !== null
            ? spotPriceSol * solPrice.priceUsd
            : null;
        }

        const initialRealToken = globals?.initialRealToken ?? BigInt(793_100_000) * 1_000_000n;
        const completionRatio = initialRealToken > 0n
          ? 1 - Number(account.realTokenReserves) / Number(initialRealToken)
          : 0;

        return {
          virtualQuoteReserves: vQuote,
          virtualTokenReserves: vToken,
          realQuoteReserves: rQuote,
          realTokenReserves: rToken,
          tokenDecimals: TOKEN_DECIMALS,
          completionRatio: Math.max(0, Math.min(1, completionRatio)),
          isComplete: account.complete,
          spotPriceSol,
          spotPriceUsd,
          solUsdPrice,
          solUsdFresh,
          slot,
          observedAt: Date.now(),
          bondingCurvePda: pda.address,
          bump: pda.bump,
          quoteMint: account.quoteMint,
          isSolQuote: account.quoteMint === SYSTEM_PROGRAM,
          creatorFeeBps,
          protocolFeeBps,
          creator: account.creator,
        };
      } catch { return null; }
    },

    async getBuyQuote(tokenMint: string, solAmount: number, slippageBps = 100): Promise<BondingCurveQuote | null> {
      const state = await this.getCurveState(tokenMint);
      // Completed curves and non-SOL quote mints: pricing explicitly unavailable.
      if (!state || state.isComplete || !state.isSolQuote || state.spotPriceSol === null) return null;

      const lamportsIn = BigInt(Math.floor(solAmount * 1e9));
      const vQuote = BigInt(Math.floor(state.virtualQuoteReserves));
      const vToken = BigInt(Math.floor(state.virtualTokenReserves));
      const realToken = BigInt(Math.floor(state.realTokenReserves));
      if (lamportsIn <= 0n) return null;

      let { tokensOut, protocolFee, creatorFee } = calcBuyTokensOut(
        vQuote, vToken, lamportsIn, state.protocolFeeBps, state.creatorFeeBps
      );
      if (tokensOut <= 0n) return null;

      // Cap at remaining curve reserves — the curve cannot sell more tokens than
      // real_token_reserves. Beyond that the buy would cross completion.
      if (tokensOut > realToken) {
        tokensOut = realToken;
        // Recompute proportional fees on the capped amount (floor, matching program integer math)
        protocolFee = (lamportsIn * BigInt(state.protocolFeeBps)) / 10000n;
        creatorFee = (lamportsIn * BigInt(state.creatorFeeBps)) / 10000n;
      }
      if (tokensOut <= 0n) return null;

      const tokensOutNum = Number(tokensOut) / Math.pow(10, TOKEN_DECIMALS);
      const afterFeeNum = solAmount - (Number(protocolFee) + Number(creatorFee)) / 1e9;
      const priceSol = afterFeeNum / tokensOutNum;
      const spotPriceSol = state.spotPriceSol;
      const priceImpact = spotPriceSol > 0
        ? Math.abs((priceSol - spotPriceSol) / spotPriceSol) * 100 : 0;

      return {
        priceSol,
        priceUsd: state.solUsdFresh && state.solUsdPrice !== null ? priceSol * state.solUsdPrice : null,
        solAmount,
        priceImpact,
        referenceSpotPriceSol: spotPriceSol,
        executable: true,
        stateAge: Date.now() - state.observedAt,
        minOut: tokensOutNum * (1 - slippageBps / 10000),
        slippageBps,
        protocolFee: Number(protocolFee) / 1e9,
        creatorFee: Number(creatorFee) / 1e9,
        totalFeeBps: state.protocolFeeBps + state.creatorFeeBps,
      };
    },

    async getSellQuote(tokenMint: string, tokenAmount: number, slippageBps = 100): Promise<BondingCurveQuote | null> {
      const state = await this.getCurveState(tokenMint);
      if (!state || state.isComplete || !state.isSolQuote || state.spotPriceSol === null) return null;

      const tokenUnitsIn = BigInt(Math.floor(tokenAmount * Math.pow(10, TOKEN_DECIMALS)));
      const vQuote = BigInt(Math.floor(state.virtualQuoteReserves));
      const vToken = BigInt(Math.floor(state.virtualTokenReserves));
      if (tokenUnitsIn <= 0n) return null;

      const { quoteOut, protocolFee, creatorFee } = calcSellQuoteOut(
        vQuote, vToken, tokenUnitsIn, state.protocolFeeBps, state.creatorFeeBps
      );
      if (quoteOut <= 0n) return null;

      const solOut = Number(quoteOut) / 1e9;
      const priceSol = solOut / tokenAmount;
      const spotPriceSol = state.spotPriceSol;
      const priceImpact = spotPriceSol > 0
        ? Math.abs((spotPriceSol - priceSol) / spotPriceSol) * 100 : 0;

      return {
        priceSol,
        priceUsd: state.solUsdFresh && state.solUsdPrice !== null ? priceSol * state.solUsdPrice : null,
        solAmount: solOut,
        priceImpact,
        referenceSpotPriceSol: spotPriceSol,
        executable: true,
        stateAge: Date.now() - state.observedAt,
        minOut: solOut * (1 - slippageBps / 10000),
        slippageBps,
        protocolFee: Number(protocolFee) / 1e9,
        creatorFee: Number(creatorFee) / 1e9,
        totalFeeBps: state.protocolFeeBps + state.creatorFeeBps,
      };
    },
  };
}

// ── Registry ───────────────────────────────────────────────

const adapters = new Map<string, BondingCurveAdapter>();

export function registerBondingCurveAdapter(adapter: BondingCurveAdapter) {
  adapters.set(adapter.id, adapter);
}

registerBondingCurveAdapter(createPumpFunBondingCurveAdapter());

export function getBondingCurveAdapter(chainId: ChainId): BondingCurveAdapter | null {
  for (const a of adapters.values()) {
    if (a.chainId === chainId) return a;
  }
  return null;
}

// ── Convenience ────────────────────────────────────────────

export async function getBondingCurvePrice(chainId: ChainId, tokenMint: string): Promise<number | null> {
  const a = getBondingCurveAdapter(chainId);
  if (!a) return null;
  return (await a.getCurveState(tokenMint))?.spotPriceUsd ?? null;
}

export async function getBondingCurveState(chainId: ChainId, tokenMint: string): Promise<BondingCurveState | null> {
  const a = getBondingCurveAdapter(chainId);
  if (!a) return null;
  return a.getCurveState(tokenMint);
}

export async function isTokenOnBondingCurve(chainId: ChainId, tokenMint: string): Promise<boolean> {
  const s = await getBondingCurveState(chainId, tokenMint);
  return s !== null && !s.isComplete;
}