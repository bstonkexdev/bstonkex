// BSTONKEX Sandbox Detection — shared across all engine modules
// In the preview sandbox, external network calls are blocked and return 403.
// All modules that make fetch() calls to external APIs should check this first.

let _cached: boolean | null = null;

/** Returns true if running inside the gitlawb preview sandbox. */
export function isSandboxed(): boolean {
  if (_cached !== null) return _cached;
  try {
    _cached = /\/api\/preview\//.test(location.pathname);
  } catch {
    _cached = false;
  }
  return _cached;
}