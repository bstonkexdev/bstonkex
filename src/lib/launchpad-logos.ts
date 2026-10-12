// Cupcak8 Swap — Launchpad Logo Configuration
// Maps launchpad IDs to display name, brand color, and local SVG logo asset
// Logos stored at public/images/launchpads/ with text fallbacks on load failure
// Each entry documents the verified official website for brand traceability

export interface LaunchpadLogo {
  id: string;
  name: string;
  displayName: string;
  color: string;
  bgColor: string;
  initials: string;
  imgSrc: string;
  officialUrl: string;
  logoSource: string;
}

// Chain → launchpad IDs per specification
export const CHAIN_LAUNCHPADS: Record<string, string[]> = {
  bsc: ['flap-swap', 'four-meme', 'genius'],
  base: ['o1-exchange', 'stonk-fun', 'openlaunch'],
  robinhood: ['pons', 'openlaunch'],
  solana: ['pumpfun', 'bags', 'stonk'],
};

const IMG = '/images/launchpads';

export const LAUNCHPAD_LOGOS: Record<string, LaunchpadLogo> = {
  'flap-swap': {
    id: 'flap-swap', name: 'Flap Swap', displayName: 'Flap Swap',
    color: '#D0FF00', bgColor: '#1A1A2E', initials: 'FS',
    imgSrc: '/assets/1791777500495-fss118.jpg',
    officialUrl: 'https://flap.sh/',
    logoSource: 'Official Flap Swap logo (uploaded JPG, user-provided)',
  },
  'four-meme': {
    id: 'four-meme', name: '4meme', displayName: '4meme',
    color: '#FF6D00', bgColor: '#FFF3E0', initials: '4M',
    imgSrc: '/assets/1791779927588-khb50w.jpg',
    officialUrl: 'https://four.meme/',
    logoSource: 'Official 4meme logo (uploaded JPG, user-provided)',
  },
  'genius': {
    id: 'genius', name: 'Genius', displayName: 'Genius',
    color: '#FE86B4', bgColor: '#090016', initials: 'GN',
    imgSrc: `${IMG}/genius.svg`,
    officialUrl: 'https://genius.fun/',
    logoSource: 'genius.fun/icon.svg — official icon (SVG, pink #FE86B4 G-mark on dark)',
  },
  'o1-exchange': {
    id: 'o1-exchange', name: 'O1 Launchpad', displayName: 'O1 Launchpad',
    color: '#0052FF', bgColor: '#E8F0FE', initials: 'O1',
    imgSrc: '/assets/1791781275000-fjxpw0.png',
    officialUrl: 'https://www.o1launchpad.com/',
    logoSource: 'Official O1 Launchpad logo (uploaded PNG, user-provided)',
  },
  'stonk-fun': {
    id: 'stonk-fun', name: 'Stonk.fun', displayName: 'Stonk.fun',
    color: '#2E7D32', bgColor: '#E8F5E9', initials: 'SF',
    imgSrc: `${IMG}/stonk-fun.png`,
    officialUrl: 'https://basestonk.io/',
    logoSource: 'basestonk.io/app-icon.png — official app icon (PNG 256×256, transparent RGBA)',
  },
  'openlaunch': {
    id: 'openlaunch', name: 'Openlaunch', displayName: 'Openlaunch',
    color: '#0052FF', bgColor: '#E8F0FE', initials: 'OL',
    imgSrc: `${IMG}/openlaunch.svg`,
    officialUrl: 'https://openlaunch.lol/',
    logoSource: 'openlaunch.lol/icon.svg — official icon (SVG, blue #0052FF rounded square). Same project across Base + RH chains.',
  },
  'pons': {
    id: 'pons', name: 'Pons', displayName: 'Pons',
    color: '#F57F17', bgColor: '#FFF8E1', initials: 'PN',
    imgSrc: `${IMG}/pons.png`,
    officialUrl: 'https://www.pons.money/',
    logoSource: 'docs.ponsfamily.com/favicon.png — official icon from Pons documentation (PNG 512×512, transparent RGBA)',
  },
  'pumpfun': {
    id: 'pumpfun', name: 'Pump.fun', displayName: 'Pump.fun',
    color: '#5FCB88', bgColor: '#1A1A2E', initials: 'PF',
    imgSrc: '/assets/1791780232085-5hdc0n.png',
    officialUrl: 'https://pump.fun/',
    logoSource: 'Official Pump.fun logo (uploaded PNG, user-provided)',
  },
  'bags': {
    id: 'bags', name: 'Bags', displayName: 'Bags',
    color: '#F9A825', bgColor: '#FFFDE7', initials: 'BG',
    imgSrc: `${IMG}/bags.png`,
    officialUrl: 'https://bags.fm/',
    logoSource: 'bags.fm/icon.png — official icon (PNG 1024×1024)',
  },
  'stonk': {
    id: 'stonk', name: 'Stonk', displayName: 'Stonk',
    color: '#E64A19', bgColor: '#FBE9E7', initials: 'ST',
    imgSrc: '/assets/1791780570183-l76tqa.png',
    officialUrl: 'https://stonk.fun/',
    logoSource: 'Official Stonk (Solana) logo (uploaded PNG, user-provided)',
  },
};

/** Get launchpad IDs for a chain */
export function getLaunchpadsForChain(chainId: string): string[] {
  return CHAIN_LAUNCHPADS[chainId] ?? [];
}

/** Get logo config by launchpad ID */
export function getLaunchpadLogo(id: string): LaunchpadLogo | null {
  return LAUNCHPAD_LOGOS[id] ?? null;
}
