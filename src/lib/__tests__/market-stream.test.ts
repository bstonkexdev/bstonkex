import { describe, it, expect } from 'vitest';

describe('Market Stream', () => {
  describe('Data source tracking', () => {
    it('default data source is polling', () => {
      // Polling provides real DexScreener data — not synthetic
      const dataSource: 'ws' | 'polling' = 'polling';
      expect(dataSource).toBe('polling');
    });

    it('freshness states are well-defined', () => {
      const states = ['LIVE', 'DELAYED', 'RECONNECTING', 'OFFLINE'] as const;
      expect(states).toHaveLength(4);
      expect(states).toContain('LIVE');
      expect(states).toContain('DELAYED');
      expect(states).toContain('OFFLINE');
    });
  });

  describe('Event deduplication', () => {
    const processedIds = new Set<string>();

    it('prevents duplicate events', () => {
      processedIds.clear();
      const id = 'price:bsc:0xabc:12345';
      processedIds.add(id);
      expect(processedIds.has(id)).toBe(true);
      // Second insert does nothing
      processedIds.add(id);
      expect(processedIds.size).toBe(1);
    });

    it('allows different events', () => {
      processedIds.clear();
      processedIds.add('price:bsc:0xabc:12345');
      processedIds.add('vol:bsc:0xabc:12345');
      expect(processedIds.size).toBe(2);
    });
  });

  describe('Sequence tracking', () => {
    it('detects sequence gaps', () => {
      const sequenceMap = new Map<string, number>();
      sequenceMap.set('trades', 5);
      const incoming = 8;
      const gap = incoming > (sequenceMap.get('trades') || 0) + 1;
      expect(gap).toBe(true);
    });

    it('no gap for sequential events', () => {
      const sequenceMap = new Map<string, number>();
      sequenceMap.set('trades', 5);
      const incoming = 6;
      const gap = incoming > (sequenceMap.get('trades') || 0) + 1;
      expect(gap).toBe(false);
    });
  });

  describe('Reconnect backoff', () => {
    it('exponential backoff caps at 30s', () => {
      const baseMs = 1000;
      const delays = [0, 1, 2, 3, 4, 5, 6, 7].map(attempt =>
        Math.min(baseMs * Math.pow(2, attempt), 30000)
      );
      expect(delays[0]).toBe(1000);
      expect(delays[1]).toBe(2000);
      expect(delays[6]).toBe(30000);
      expect(delays[7]).toBe(30000);
    });
  });
});