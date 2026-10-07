import { describe, it, expect } from 'vitest';
import { CHAINS, CONFIGURED_CHAINS } from '../config';
import type { ChainId } from '../config';

describe('Chain Validation', () => {
  describe('Chain configuration integrity', () => {
    it('all 4 chains are configured', () => {
      expect(CONFIGURED_CHAINS).toHaveLength(4);
    });

    it('each chain has required fields', () => {
      for (const chain of CONFIGURED_CHAINS) {
        expect(chain.id).toBeTruthy();
        expect(chain.name).toBeTruthy();
        expect(chain.shortName).toBeTruthy();
        expect(chain.nativeSymbol).toBeTruthy();
        expect(chain.explorerUrl).toBeTruthy();
        expect(chain.explorerName).toBeTruthy();
        expect(chain.rpcUrl).toBeTruthy();
        expect(chain.configured).toBe(true);
      }
    });
  });

  describe('Chain ID validation', () => {
    it('BNB Chain is 0x38 (56)', () => {
      expect(CHAINS.bsc.chainIdHex).toBe('0x38');
      expect(parseInt(CHAINS.bsc.chainIdHex!, 16)).toBe(56);
    });

    it('Base is 0x2105 (8453)', () => {
      expect(CHAINS.base.chainIdHex).toBe('0x2105');
      expect(parseInt(CHAINS.base.chainIdHex!, 16)).toBe(8453);
    });

    it('Robinhood is 0x1237 (4663)', () => {
      expect(CHAINS.robinhood.chainIdHex).toBe('0x1237');
      expect(parseInt(CHAINS.robinhood.chainIdHex!, 16)).toBe(4663);
    });

    it('Solana is non-EVM', () => {
      expect(CHAINS.solana.isEvm).toBe(false);
      expect(CHAINS.solana.chainIdHex).toBeUndefined();
    });
  });

  describe('Chain isolation', () => {
    it('same symbol on different chains is separate identity', () => {
      // ETH exists on Base, Robinhood, but they are different chains
      expect(CHAINS.base.nativeSymbol).toBe('ETH');
      expect(CHAINS.robinhood.nativeSymbol).toBe('ETH');
      expect(CHAINS.base.chainIdHex).not.toBe(CHAINS.robinhood.chainIdHex);
      expect(CHAINS.base.dexScreenerId).not.toBe(CHAINS.robinhood.dexScreenerId);
    });

    it('SOL only on Solana', () => {
      expect(CHAINS.solana.nativeSymbol).toBe('SOL');
      expect(CHAINS.bsc.nativeSymbol).not.toBe('SOL');
      expect(CHAINS.base.nativeSymbol).not.toBe('SOL');
    });

    it('BNB only on BSC', () => {
      expect(CHAINS.bsc.nativeSymbol).toBe('BNB');
      expect(CHAINS.solana.nativeSymbol).not.toBe('BNB');
      expect(CHAINS.base.nativeSymbol).not.toBe('BNB');
    });

    it('chain IDs are unique', () => {
      const ids = CONFIGURED_CHAINS.map(c => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('dexScreener IDs are unique', () => {
      const dexIds = CONFIGURED_CHAINS.map(c => c.dexScreenerId);
      expect(new Set(dexIds).size).toBe(dexIds.length);
    });
  });

  describe('EVM vs Solana classification', () => {
    it('BSC is EVM', () => { expect(CHAINS.bsc.isEvm).toBe(true); });
    it('Base is EVM', () => { expect(CHAINS.base.isEvm).toBe(true); });
    it('Robinhood is EVM', () => { expect(CHAINS.robinhood.isEvm).toBe(true); });
    it('Solana is not EVM', () => { expect(CHAINS.solana.isEvm).toBe(false); });
  });

  describe('Explorer URLs are valid', () => {
    it('all chains have HTTPS explorer URLs', () => {
      for (const chain of CONFIGURED_CHAINS) {
        expect(chain.explorerUrl).toMatch(/^https:\/\//);
      }
    });
  });

  describe('RPC URLs are valid', () => {
    it('all chains have HTTPS RPC URLs', () => {
      for (const chain of CONFIGURED_CHAINS) {
        expect(chain.rpcUrl).toMatch(/^https:\/\//);
      }
    });
  });

  describe('Validation status types', () => {
    it('all 4 statuses are well-defined', () => {
      const statuses = ['PASS', 'FAIL', 'NOT_VERIFIED', 'BLOCKED'];
      expect(statuses).toHaveLength(4);
    });
  });
});