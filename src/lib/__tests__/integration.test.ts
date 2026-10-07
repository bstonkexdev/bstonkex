// BSTONKEX Integration Tests — cross-system verification
import { describe, it, expect } from 'vitest';
import { calculateFees, getReferralTier } from '../engine/fee-engine';
import { checkTradeReadiness, checkPriceImpact, checkSpender } from '../engine/security-engine';
import { processTrade, getCandles, clearCandles } from '../engine/candle-engine';
import { PLATFORM_FEE_PCT, REFERRAL_TIERS, MIN_CLAIM_AMOUNT, CHAINS, CONFIGURED_CHAINS } from '../config';

describe('Cross-System Integration', () => {
  describe('Fee + Referral Integration', () => {
    it('referral reward is always <= platform fee', () => {
      // Test all tier levels
      for (const tier of REFERRAL_TIERS) {
        const result = calculateFees(10000, tier.sharePct);
        expect(result.referralRewardUsd).toBeLessThanOrEqual(result.platformFeeUsd);
        expect(result.treasuryAmountUsd).toBeGreaterThanOrEqual(0);
        expect(result.referralRewardUsd + result.treasuryAmountUsd).toBeCloseTo(result.platformFeeUsd, 6);
      }
    });

    it('referral reward comes from platform fee, not trade principal', () => {
      const tradeValue = 10000;
      const result = calculateFees(tradeValue, 30);
      // Platform fee = $40 (0.40% of $10,000)
      expect(result.platformFeeUsd).toBe(40);
      // Referral = $12 (30% of $40, NOT 30% of $10,000)
      expect(result.referralRewardUsd).toBe(12);
      // Trade value is never reduced by referral
      expect(result.tradeValueUsd).toBe(tradeValue);
    });

    it('tier thresholds match config', () => {
      expect(REFERRAL_TIERS[0].name).toBe('STARTER');
      expect(REFERRAL_TIERS[0].sharePct).toBe(10);
      expect(REFERRAL_TIERS[1].name).toBe('BUILDER');
      expect(REFERRAL_TIERS[1].sharePct).toBe(20);
      expect(REFERRAL_TIERS[2].name).toBe('PRO');
      expect(REFERRAL_TIERS[2].sharePct).toBe(30);
      expect(REFERRAL_TIERS[3].name).toBe('ELITE');
      expect(REFERRAL_TIERS[3].sharePct).toBe(35);
    });
  });

  describe('Security + Trading Integration', () => {
    it('trade is blocked when wallet not connected', () => {
      const result = checkTradeReadiness({
        wallet: { connected: false, address: null },
        walletChain: null, requiredChain: 'bsc',
        balance: null, tradeAmount: 100, networkFeeReserve: 0.001, nativePrice: 600,
        quote: null, priceImpact: 0, slippage: 0.5,
        route: [], dex: undefined, spender: undefined, platformFeePct: 0.40,
      });
      expect(result.ready).toBe(false);
    });

    it('trade is blocked for extreme price impact', () => {
      const result = checkPriceImpact(20);
      expect(result.status).toBe('block');
    });

    it('trusted spender passes, unknown warns', () => {
      const trusted = checkSpender('bsc', '0x1111111254fb6c44bac0bed2854e76f90643097d');
      const unknown = checkSpender('bsc', '0xdeadbeef');
      expect(trusted.status).toBe('pass');
      expect(unknown.status).toBe('warning');
    });
  });

  describe('Candle + Activity Integration', () => {
    it('candle engine correctly aggregates activity events into candles', () => {
      clearCandles();
      const now = Date.now();
      const trades = [
        { price: 100, amountUsd: 1000, timestamp: now, side: 'buy' as const },
        { price: 105, amountUsd: 2000, timestamp: now + 1000, side: 'buy' as const },
        { price: 98, amountUsd: 1500, timestamp: now + 2000, side: 'sell' as const },
        { price: 102, amountUsd: 500, timestamp: now + 3000, side: 'buy' as const },
      ];

      trades.forEach(t => processTrade('bsc', '0xtoken', t));

      const candles = getCandles('bsc', '0xtoken', '1m');
      const last = candles[candles.length - 1];
      expect(last.open).toBe(100);
      expect(last.high).toBe(105);
      expect(last.low).toBe(98);
      expect(last.close).toBe(102);
      expect(last.volume).toBe(5000);
      expect(last.tradeCount).toBe(4);
    });
  });

  describe('Chain Configuration', () => {
    it('all configured chains have valid config', () => {
      for (const chainId of CONFIGURED_CHAINS) {
        const chain = CHAINS[chainId];
        expect(chain).toBeDefined();
        expect(chain.name).toBeTruthy();
        expect(chain.shortName).toBeTruthy();
        expect(chain.nativeSymbol).toBeTruthy();
        expect(chain.explorerName).toBeTruthy();
      }
    });

    it('Robinhood Chain has correct chain ID (0x1237 = 4663)', () => {
      const robinhood = CHAINS.robinhood;
      expect(robinhood).toBeDefined();
      expect(robinhood.chainIdHex).toBe('0x1237');
      // 0x1237 = 4663 in decimal
      expect(parseInt(robinhood.chainIdHex!, 16)).toBe(4663);
    });

    it('Solana is configured', () => {
      expect(CHAINS.solana).toBeDefined();
      expect(CHAINS.solana.shortName).toBe('SOL');
    });

    it('Base is configured', () => {
      expect(CHAINS.base).toBeDefined();
      expect(CHAINS.base.shortName).toBe('BASE');
    });

    it('BNB is configured', () => {
      expect(CHAINS.bsc).toBeDefined();
      expect(CHAINS.bsc.shortName).toBe('BNB');
    });
  });

  describe('Platform Constants', () => {
    it('platform fee is 0.40%', () => {
      expect(PLATFORM_FEE_PCT).toBe(0.004);
    });

    it('minimum claim is $10', () => {
      expect(MIN_CLAIM_AMOUNT).toBe(10);
    });

    it('all four referral tiers exist', () => {
      expect(REFERRAL_TIERS).toHaveLength(4);
    });
  });
});