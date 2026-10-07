// BSTONKEX Security Engine Tests — deterministic validation
import { describe, it, expect } from 'vitest';
import {
  checkWallet, checkNetwork, checkBalance, checkQuote,
  checkPriceImpact, checkSlippage, checkRoute, checkSpender, checkFee,
  checkTradeReadiness, type TradeReadinessParams,
} from '../engine/security-engine';

describe('Security Engine', () => {
  describe('checkWallet', () => {
    it('passes when wallet connected with address', () => {
      const result = checkWallet({ connected: true, address: '0x1234567890abcdef' });
      expect(result.status).toBe('pass');
    });

    it('blocks when wallet not connected', () => {
      const result = checkWallet({ connected: false, address: null });
      expect(result.status).toBe('block');
      expect(result.severity).toBe('critical');
    });
  });

  describe('checkNetwork', () => {
    it('passes when chains match', () => {
      const result = checkNetwork('bsc', 'bsc');
      expect(result.status).toBe('pass');
    });

    it('blocks when chains mismatch', () => {
      const result = checkNetwork('bsc', 'base');
      expect(result.status).toBe('block');
      expect(result.severity).toBe('critical');
    });

    it('returns unknown when wallet chain is null', () => {
      const result = checkNetwork(null, 'bsc');
      expect(result.status).toBe('unknown');
    });
  });

  describe('checkBalance', () => {
    it('passes when balance sufficient', () => {
      const result = checkBalance(1.0, 100, 0.001, 600);
      expect(result.status).toBe('pass');
    });

    it('blocks when balance insufficient', () => {
      const result = checkBalance(0.001, 100, 0.001, 600);
      expect(result.status).toBe('block');
    });

    it('returns unknown when balance is null', () => {
      const result = checkBalance(null, 100, 0.001, 600);
      expect(result.status).toBe('unknown');
    });

    it('reserves gas correctly', () => {
      // Balance: 0.01 BNB at $600 = $6. Trade $5 + gas reserve 0.001 BNB ($0.60) = $5.60. Should pass.
      const result = checkBalance(0.01, 5, 0.001, 600);
      expect(result.status).toBe('pass');
    });
  });

  describe('checkQuote', () => {
    it('passes when quote available and not expired', () => {
      const result = checkQuote({ available: true, quoteId: 'q1', remainingSeconds: 5 });
      expect(result.status).toBe('pass');
    });

    it('blocks when quote expired', () => {
      const result = checkQuote({ available: true, quoteId: 'q1', remainingSeconds: 0 });
      expect(result.status).toBe('block');
    });

    it('blocks when quote unavailable', () => {
      const result = checkQuote({ available: false, quoteId: 'q1', remainingSeconds: 5 });
      expect(result.status).toBe('block');
    });

    it('returns unknown when no quote', () => {
      const result = checkQuote(null);
      expect(result.status).toBe('unknown');
    });
  });

  describe('checkPriceImpact', () => {
    it('passes for low impact (<1%)', () => {
      expect(checkPriceImpact(0.5).status).toBe('pass');
    });

    it('warns for medium impact (1-5%)', () => {
      expect(checkPriceImpact(2).status).toBe('warning');
    });

    it('warns for high impact (5-15%)', () => {
      const result = checkPriceImpact(8);
      expect(result.status).toBe('warning');
      expect(result.severity).toBe('high');
    });

    it('blocks for extreme impact (>=15%)', () => {
      const result = checkPriceImpact(20);
      expect(result.status).toBe('block');
      expect(result.severity).toBe('critical');
    });
  });

  describe('checkSlippage', () => {
    it('passes for normal slippage', () => {
      expect(checkSlippage(0.5).status).toBe('pass');
    });

    it('warns for high slippage (3-10%)', () => {
      expect(checkSlippage(5).status).toBe('warning');
    });

    it('warns for very high slippage (>=10%)', () => {
      const result = checkSlippage(15);
      expect(result.status).toBe('warning');
      expect(result.severity).toBe('high');
    });
  });

  describe('checkRoute', () => {
    it('passes when route exists', () => {
      expect(checkRoute(['USDC', 'WBNB', 'TOKEN'], 'PancakeSwap').status).toBe('pass');
    });

    it('blocks when no route', () => {
      expect(checkRoute([], undefined).status).toBe('block');
    });
  });

  describe('checkSpender', () => {
    it('passes for known trusted spender', () => {
      const result = checkSpender('bsc', '0x1111111254fb6c44bac0bed2854e76f90643097d');
      expect(result.status).toBe('pass');
    });

    it('warns for unknown spender', () => {
      const result = checkSpender('bsc', '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
      expect(result.status).toBe('warning');
      expect(result.severity).toBe('high');
    });

    it('returns unknown when no spender', () => {
      expect(checkSpender('bsc', undefined).status).toBe('unknown');
    });
  });

  describe('checkFee', () => {
    it('passes for correct 0.40% fee', () => {
      expect(checkFee(0.40).status).toBe('pass');
    });

    it('warns for incorrect fee', () => {
      expect(checkFee(1.0).status).toBe('warning');
    });
  });

  describe('checkTradeReadiness', () => {
    const baseParams: TradeReadinessParams = {
      wallet: { connected: true, address: '0x123' },
      walletChain: 'bsc',
      requiredChain: 'bsc',
      balance: 1.0,
      tradeAmount: 100,
      networkFeeReserve: 0.001,
      nativePrice: 600,
      quote: { available: true, quoteId: 'q1', remainingSeconds: 5 },
      priceImpact: 0.5,
      slippage: 0.5,
      route: ['USDC', 'TOKEN'],
      dex: 'PancakeSwap',
      spender: '0x1111111254fb6c44bac0bed2854e76f90643097d',
      platformFeePct: 0.40,
    };

    it('is ready when all checks pass', () => {
      const result = checkTradeReadiness(baseParams);
      expect(result.ready).toBe(true);
      expect(result.blockingChecks).toHaveLength(0);
    });

    it('is not ready when wallet disconnected', () => {
      const result = checkTradeReadiness({ ...baseParams, wallet: { connected: false, address: null } });
      expect(result.ready).toBe(false);
      expect(result.blockingChecks.length).toBeGreaterThan(0);
    });

    it('is not ready when network mismatch', () => {
      const result = checkTradeReadiness({ ...baseParams, walletChain: 'base' });
      expect(result.ready).toBe(false);
    });

    it('is not ready when quote expired', () => {
      const result = checkTradeReadiness({ ...baseParams, quote: { available: true, quoteId: 'q1', remainingSeconds: 0 } });
      expect(result.ready).toBe(false);
    });

    it('warns but is ready for high price impact', () => {
      const result = checkTradeReadiness({ ...baseParams, priceImpact: 8 });
      expect(result.ready).toBe(true);
      expect(result.warningChecks.length).toBeGreaterThan(0);
    });

    it('is not ready for extreme price impact', () => {
      const result = checkTradeReadiness({ ...baseParams, priceImpact: 20 });
      expect(result.ready).toBe(false);
    });
  });
});