// BSTONKEX Performance Monitor — track real bottlenecks, no fake metrics

interface PerfMetric {
  name: string;
  value: number;
  unit: 'ms' | 'count' | 'bytes';
  timestamp: number;
}

const metrics: PerfMetric[] = [];
const MAX_METRICS = 500;
let listeners: ((m: PerfMetric) => void)[] = [];

export function onPerfMetric(cb: (m: PerfMetric) => void): () => void {
  listeners.push(cb);
  return () => { listeners = listeners.filter(l => l !== cb); };
}

function record(name: string, value: number, unit: PerfMetric['unit'] = 'ms') {
  const m = { name, value, unit, timestamp: Date.now() };
  metrics.push(m);
  if (metrics.length > MAX_METRICS) metrics.splice(0, 100);
  listeners.forEach(l => l(m));
}

/** Measure an async operation. */
export async function measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    record(name, performance.now() - start);
    return result;
  } catch (e) {
    record(`${name}:error`, performance.now() - start);
    throw e;
  }
}

/** Record a render time. */
export function recordRender(component: string, ms: number) {
  if (ms > 16) record(`render:${component}`, ms); // only log slow renders (>1 frame)
}

/** Get metrics by name prefix. */
export function getMetrics(prefix?: string): PerfMetric[] {
  if (!prefix) return metrics.slice(-100);
  return metrics.filter(m => m.name.startsWith(prefix)).slice(-100);
}

/** Get average of a metric. */
export function getAvgMetric(name: string, last = 20): number {
  const recent = metrics.filter(m => m.name === name).slice(-last);
  if (recent.length === 0) return 0;
  return recent.reduce((s, m) => s + m.value, 0) / recent.length;
}

/** Performance observer for Web Vitals (if available). */
export function initWebVitals() {
  if (typeof PerformanceObserver === 'undefined') return;
  try {
    const lcp = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'largest-contentful-paint') record('web-vitals:lcp', entry.startTime);
      }
    });
    lcp.observe({ type: 'largest-contentful-paint', buffered: true });

    const fid = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        record('web-vitals:fid', (entry as any).processingStart - entry.startTime);
      }
    });
    fid.observe({ type: 'first-input', buffered: true });
  } catch { /* older browsers */ }
}

/** Track page load timing. */
export function trackPageLoad() {
  if (typeof window === 'undefined') return;
  window.addEventListener('load', () => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav) {
      record('load:ttfb', nav.responseStart - nav.requestStart);
      record('load:dom-ready', nav.domContentLoadedEventEnd - nav.startTime);
      record('load:full', nav.loadEventEnd - nav.startTime);
    }
  });
}

/** Summary for display. */
export function getPerfSummary(): Record<string, string> {
  return {
    'Avg API': `${getAvgMetric('api').toFixed(0)}ms`,
    'Avg Render': `${getAvgMetric('render').toFixed(0)}ms`,
    'Metrics': `${metrics.length}`,
  };
}