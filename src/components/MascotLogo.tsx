// Cupcak8 Swap — Brand Mascot Logo
// Primary: official mascot image with proper rendering
// Fallback: inline SVG pixel-cat mascot (works if image fails)
import { useState, useCallback } from 'react';

const MASCOT_SRC = '/assets/1791714349061-z05cep.png';

// Inline SVG pixel-art cat mascot — crisp at any size, uses accent color
function SvgMascot({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }} aria-label="Cupcak8 mascot">
      {/* Cat ears */}
      <polygon points="12,8 20,24 4,24" fill={color} />
      <polygon points="52,8 60,24 44,24" fill={color} />
      <polygon points="14,12 18,22 8,22" fill="#FFD6E0" />
      <polygon points="50,12 56,22 46,22" fill="#FFD6E0" />
      {/* Head */}
      <ellipse cx="32" cy="34" rx="22" ry="20" fill="#FFF5F7" stroke={color} strokeWidth="2" />
      {/* Eyes */}
      <ellipse cx="23" cy="32" rx="3.5" ry="4" fill="#3D2B1F" />
      <ellipse cx="41" cy="32" rx="3.5" ry="4" fill="#3D2B1F" />
      <ellipse cx="24" cy="31" rx="1.5" ry="1.5" fill="#fff" />
      <ellipse cx="42" cy="31" rx="1.5" ry="1.5" fill="#fff" />
      {/* Nose */}
      <ellipse cx="32" cy="38" rx="2.5" ry="2" fill={color} />
      {/* Mouth */}
      <path d="M28 41 Q30 44 32 41 Q34 44 36 41" stroke="#3D2B1F" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      {/* Whiskers */}
      <line x1="8" y1="36" x2="20" y2="37" stroke="#D4BFA8" strokeWidth="1" />
      <line x1="8" y1="40" x2="20" y2="40" stroke="#D4BFA8" strokeWidth="1" />
      <line x1="44" y1="37" x2="56" y2="36" stroke="#D4BFA8" strokeWidth="1" />
      <line x1="44" y1="40" x2="56" y2="40" stroke="#D4BFA8" strokeWidth="1" />
      {/* Cupcake on head */}
      <rect x="25" y="10" width="14" height="8" rx="2" fill="#FFD6E0" stroke={color} strokeWidth="1" />
      {/* Frosting */}
      <path d="M24 10 Q27 5 30 9 Q32 4 34 9 Q37 5 40 10" fill={color} />
      {/* Cherry */}
      <circle cx="32" cy="5" r="2.5" fill={color} />
      <line x1="32" y1="3" x2="33" y2="1" stroke="#22C55E" strokeWidth="1" />
      {/* Number 8 on forehead */}
      <circle cx="32" cy="22" r="3" fill="none" stroke={color} strokeWidth="1.5" />
      <circle cx="32" cy="28" r="2" fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

export default function MascotLogo({ size = 40, color = '#E8547C' }: { size?: number; color?: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  const onError = useCallback(() => setImgFailed(true), []);

  if (imgFailed) {
    return <SvgMascot size={size} color={color} />;
  }

  return (
    <img
      src={MASCOT_SRC}
      alt="Cupcak8 mascot"
      width={size}
      height={size}
      onError={onError}
      style={{
        flexShrink: 0,
        objectFit: 'contain',
        borderRadius: 6,
        display: 'block',
      }}
      draggable={false}
    />
  );
}