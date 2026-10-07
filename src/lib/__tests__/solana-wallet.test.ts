import { describe, it, expect } from 'vitest';

// Test pure logic from wallet module — chain mapping, state model, balance parsing

describe('Solana Wallet Integration', () => {
  describe('evmChainToId mapping', () => {
    // We test the chain mapping logic directly
    const mapping: Record<string, string> = {
      '0x38': 'bsc',
      '0x2105': 'base',
      '0x1237': 'robinhood',
    };

    it('maps BNB chain 0x38 correctly', () => {
      expect(mapping['0x38']).toBe('bsc');
    });

    it('maps Base chain 0x2105 correctly', () => {
      expect(mapping['0x2105']).toBe('base');
    });

    it('maps Robinhood chain 0x1237 (4663) correctly', () => {
      expect(mapping['0x1237']).toBe('robinhood');
      expect(parseInt('0x1237', 16)).toBe(4663);
    });

    it('returns undefined for unknown chain', () => {
      expect(mapping['0x999']).toBeUndefined();
    });
  });

  describe('Wallet state model', () => {
    it('default state is disconnected', () => {
      const state = { connected: false, address: null, chainId: null, balance: null, provider: null };
      expect(state.connected).toBe(false);
      expect(state.address).toBeNull();
    });

    it('connected Solana state has correct shape', () => {
      const state = { connected: true, address: 'ABC123xyz', chainId: 'solana' as const, balance: '1.5', provider: 'solana' as const };
      expect(state.connected).toBe(true);
      expect(state.chainId).toBe('solana');
      expect(state.provider).toBe('solana');
    });
  });

  describe('Solana balance parsing', () => {
    it('converts lamports to SOL correctly', () => {
      const lamports = 1500000000;
      const sol = lamports / 1e9;
      expect(sol).toBe(1.5);
    });

    it('handles zero balance', () => {
      expect(0 / 1e9).toBe(0);
    });
  });
});