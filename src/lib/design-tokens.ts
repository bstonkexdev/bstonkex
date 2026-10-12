// Cupcak8 Terminal — Design Tokens (JS/TS usage)
// Light theme · Vanilla cream · Strawberry pink · Chocolate brown
export const colors = {
  bgDeep: '#FFF8F0',
  bgSurface: '#FFFFFF',
  bgElevated: '#FFF5EB',
  bgHover: '#FFEEE0',
  bgActive: '#FFE4D0',
  border: '#E8D5C4',
  borderBright: '#D4BFA8',
  text: '#5C3D2E',
  textBright: '#3D2B1F',
  textDim: '#8B7355',
  textMuted: '#B09A82',
  yellow: '#FFD966',
  yellowDim: '#F5C842',
  green: '#4ADE80',
  greenDim: '#22C55E',
  red: '#EF5350',
  redDim: '#D32F2F',
  cyan: '#B8A9E8',
  cyanDim: '#9B88D4',
  lime: '#4ADE80',
  limeDim: '#22C55E',
} as const;

export const fonts = {
  mono: "'JetBrains Mono', ui-monospace, 'SF Mono', monospace",
  system: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  pixel: "'Press Start 2P', 'JetBrains Mono', monospace",
} as const;