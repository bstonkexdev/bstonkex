// Chain logo SVG assets — Vite resolves these to correct URLs at build time
// regardless of the base path the app is served from.
import bnbLogo from './bnb.svg';
import solanaLogo from './solana.svg';
import baseLogo from './base.svg';
import robinhoodLogo from './robinhood.svg';

export const CHAIN_LOGOS: Record<string, string> = {
  bsc: bnbLogo,
  solana: solanaLogo,
  base: baseLogo,
  robinhood: robinhoodLogo,
};