import { useState, useRef, useCallback, useMemo, type CSSProperties, type ReactNode } from 'react';

interface Props<T> {
  items: T[];
  itemHeight: number;
  renderItem: (item: T, index: number) => ReactNode;
  overscan?: number;
  style?: CSSProperties;
  className?: string;
  onEndReached?: () => void;
  endThreshold?: number;
}

/** Lightweight virtualized list — no external deps. */
export default function VirtualList<T>({
  items, itemHeight, renderItem, overscan = 5,
  style, className, onEndReached, endThreshold = 200,
}: Props<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const totalHeight = items.length * itemHeight;
  const containerHeight = containerRef.current?.clientHeight || 600;

  const { startIdx, endIdx, offsetY } = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const visible = Math.ceil(containerHeight / itemHeight);
    const end = Math.min(items.length, start + visible + overscan * 2);
    return { startIdx: start, endIdx: end, offsetY: start * itemHeight };
  }, [scrollTop, itemHeight, items.length, containerHeight, overscan]);

  const visibleItems = useMemo(() => {
    return items.slice(startIdx, endIdx).map((item, i) => renderItem(item, startIdx + i));
  }, [items, startIdx, endIdx, renderItem]);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    setScrollTop(target.scrollTop);

    // End reached callback
    if (onEndReached) {
      const distToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
      if (distToBottom < endThreshold) onEndReached();
    }
  }, [onEndReached, endThreshold]);

  return (
    <div ref={containerRef} className={className} style={{ overflow: 'auto', ...style }} onScroll={onScroll}>
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ position: 'absolute', top: offsetY, left: 0, right: 0 }}>
          {visibleItems}
        </div>
      </div>
    </div>
  );
}

/** Memoized market row to prevent unnecessary rerenders. */
export function useStableCallback<T extends (...args: any[]) => any>(fn: T): T {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args: any[]) => ref.current(...args), []) as unknown as T;
}