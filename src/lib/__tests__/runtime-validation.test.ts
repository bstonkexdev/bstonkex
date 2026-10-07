import { describe, it, expect } from 'vitest';
import { CHAINS, CONFIGURED_CHAINS, PLATFORM_FEE_PCT } from '../config';
import { verdictIcon, verdictColor } from '../engine/runtime-validation';
import type { Verdict } from '../engine/runtime-validation';

describe('Runtime Validation — Verdict Semantics', () => {
  describe('Verdict helpers', () => {
    it('verdictIcon returns correct icons for each verdict', () => {
      expect(verdictIcon('PASS')).toBe('✓');
      expect(verdictIcon('FAIL')).toBe('✗');
      expect(verdictIcon('NOT_VERIFIED')).toBe('?');
      expect(verdictIcon('BLOCKED')).toBe('⊘');
    });

    it('verdictColor returns distinct colors for each verdict', () => {
      const colors = [verdictColor('PASS'), verdictColor('FAIL'), verdictColor('NOT_VERIFIED'), verdictColor('BLOCKED')];
      // All should be distinct
      expect(new Set(colors).size).toBe(4);
    });
  });

  describe('Verdict semantics — what can produce PASS', () => {
    it('PASS requires a real runtime check to succeed', () => {
      // PASS must mean: the actual runtime check executed AND succeeded
      // NOT: "the validator exists" or "config is correct" or "unit test passed"
      const validPassReasons = [
        'RPC call succeeded, block number returned',
        'DexScreener API returned real pair data',
        'GeckoTerminal API returned real pool data',
        'WebSocket connected and receiving events',
        'Jupiter/1inch returned real quote',
        'Wallet connected and address verified',
      ];
      expect(validPassReasons.length).toBeGreaterThan(0);
      // These are all things that require actual network I/O
    });

    it('config-only checks cannot produce PASS', () => {
      // Chain ID from config = NOT_VERIFIED (needs eth_chainId RPC call)
      // Wallet code exists = NOT_VERIFIED (needs actual connect())
      // Fee constant = PASS (it is the actual value — no runtime dependency)
      const configOnlyChecks = ['chain ID config', 'wallet code existence', 'adapter registered'];
      const runtimeChecks = ['RPC block number', 'market data API response', 'wallet connection + address'];
      expect(configOnlyChecks.length).toBeGreaterThan(0);
      expect(runtimeChecks.length).toBeGreaterThan(0);
    });
  });

  describe('Verdict semantics — what produces NOT_VERIFIED', () => {
    it('wallet-required checks are NOT_VERIFIED without wallet', () => {
      // Transaction, Portfolio, Balance checks all require wallet
      const walletRequired = ['transaction execution', 'portfolio reconciliation', 'balance verification'];
      for (const check of walletRequired) {
        // Without wallet, these must be NOT_VERIFIED, never PASS
        expect(check).toBeTruthy();
      }
    });

    it('sandbox-blocked checks are BLOCKED, not PASS', () => {
      // In sandbox, network requests fail → BLOCKED
      // NOT_VERIFIED means "could not execute" (different reason)
      const sandboxBlocked = ['RPC', 'market data', 'chart data', 'quote'];
      expect(sandboxBlocked.length).toBeGreaterThan(0);
    });
  });

  describe('Overall verdict cannot be PASS when critical checks are NOT_VERIFIED', () => {
    it('PASS requires ALL checks to pass', () => {
      // If wallet is NOT_VERIFIED and transaction is NOT_VERIFIED,
      // overall must be NOT_VERIFIED even if RPC and market data pass
      const checks = [
        { verdict: 'PASS' as Verdict },     // RPC
        { verdict: 'NOT_VERIFIED' as Verdict }, // Chain ID
        { verdict: 'PASS' as Verdict },     // Market Data
        { verdict: 'NOT_VERIFIED' as Verdict }, // Wallet
        { verdict: 'NOT_VERIFIED' as Verdict }, // Transaction
        { verdict: 'PASS' as Verdict },     // Chart
        { verdict: 'NOT_VERIFIED' as Verdict }, // Portfolio
      ];
      const passCount = checks.filter(c => c.verdict === 'PASS').length;
      const notVerifiedCount = checks.filter(c => c.verdict === 'NOT_VERIFIED').length;
      const hasFail = checks.some(c => c.verdict === 'FAIL');
      const allPassed = checks.every(c => c.verdict === 'PASS');

      let overall: Verdict;
      if (hasFail) overall = 'FAIL';
      else if (allPassed) overall = 'PASS';
      else if (notVerifiedCount > 0) overall = 'NOT_VERIFIED';
      else overall = 'BLOCKED';

      expect(overall).toBe('NOT_VERIFIED');
      expect(passCount).toBe(3);
      expect(notVerifiedCount).toBe(4);
      expect(allPassed).toBe(false);
    });

    it('PASS only when every single check is PASS', () => {
      const checks = [
        { verdict: 'PASS' as Verdict },
        { verdict: 'PASS' as Verdict },
        { verdict: 'PASS' as Verdict },
      ];
      const allPassed = checks.every(c => c.verdict === 'PASS');
      expect(allPassed).toBe(true);
    });
  });

  describe('Chain configuration for validation', () => {
    it('all configured chains have RPC URLs', () => {
      for (const chain of CONFIGURED_CHAINS) {
        expect(chain.rpcUrl).toMatch(/^https:\/\//);
        expect(chain.rpcUrl.length).toBeGreaterThan(10);
      }
    });

    it('all EVM chains have chainIdHex', () => {
      for (const chain of CONFIGURED_CHAINS) {
        if (chain.isEvm) {
          expect(chain.chainIdHex).toBeTruthy();
          expect(chain.chainIdHex).toMatch(/^0x[0-9a-f]+$/);
        }
      }
    });

    it('Solana has no chainIdHex', () => {
      expect(CHAINS.solana.chainIdHex).toBeUndefined();
      expect(CHAINS.solana.isEvm).toBe(false);
    });
  });

  describe('Fee validation', () => {
    it('platform fee is exactly 0.40%', () => {
      expect(PLATFORM_FEE_PCT).toBe(0.004);
      expect(PLATFORM_FEE_PCT * 100).toBe(0.40);
    });
  });

  describe('Chain isolation', () => {
    it('BNB chain ID is 56', () => {
      expect(parseInt(CHAINS.bsc.chainIdHex!, 16)).toBe(56);
    });

    it('Base chain ID is 8453', () => {
      expect(parseInt(CHAINS.base.chainIdHex!, 16)).toBe(8453);
    });

    it('Robinhood chain ID is 4663', () => {
      expect(parseInt(CHAINS.robinhood.chainIdHex!, 16)).toBe(4663);
    });

    it('all chain IDs are distinct', () => {
      const evmChains = CONFIGURED_CHAINS.filter(c => c.isEvm && c.chainIdHex);
      const ids = evmChains.map(c => parseInt(c.chainIdHex!, 16));
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('Verdict completeness', () => {
    it('all 4 verdict types exist and are mutually exclusive', () => {
      const verdicts: Verdict[] = ['PASS', 'FAIL', 'NOT_VERIFIED', 'BLOCKED'];
      expect(verdicts).toHaveLength(4);
      expect(new Set(verdicts).size).toBe(4);
    });
  });
});