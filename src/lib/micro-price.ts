/**
 * Micro price notation for low-value meme tokens.
 * Formats $0.000000258 as "$0.0₆258" (zero-subscript shorthand).
 * Used in Ave.ai-style token detail pages.
 */

/** Unicode subscript digits 0-9 */
const SUB = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];

/**
 * Format a very small price with zero-subscript notation.
 * @param price - the raw price number
 * @param prefix - currency prefix (default "$")
 * @returns formatted string, e.g. "$0.0₄258" or "$0.52" for normal prices
 *
 * Examples:
 *   0.0000258  → "$0.0₄258"
 *   0.0000000123 → "$0.0₇123"
 *   0.52       → "$0.52"
 *   1.23       → "$1.23"
 */
export function microPrice(price: number | null | undefined, prefix = '$'): string {
  if (price == null || !isFinite(price) || price <= 0) return `${prefix}—`;

  // Normal prices: use standard formatting
  if (price >= 1) {
    return `${prefix}${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  }
  if (price >= 0.001) {
    return `${prefix}${price.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')}`;
  }

  // Micro prices: count leading zeros after decimal
  const str = price.toFixed(20); // enough precision
  const afterDecimal = str.split('.')[1] || '';
  let leadingZeros = 0;
  for (const ch of afterDecimal) {
    if (ch === '0') leadingZeros++;
    else break;
  }

  // Significant digits (first 3-4 non-zero digits)
  const sigDigits = afterDecimal.slice(leadingZeros, leadingZeros + 4).replace(/0+$/, '');

  // Format as $0.0₍count₎digits
  const subCount = String(leadingZeros).split('').map(d => SUB[parseInt(d)]).join('');
  return `${prefix}0.0${subCount}${sigDigits}`;
}

/**
 * Format price change with + / - prefix and color.
 */
export function formatPriceChange(change: number | null | undefined): { text: string; color: string } {
  if (change == null || !isFinite(change)) return { text: '—', color: 'var(--text-dim)' };
  const sign = change >= 0 ? '+' : '';
  const color = change >= 0 ? '#10b981' : '#ef4444';
  return { text: `${sign}${change.toFixed(2)}%`, color };
}