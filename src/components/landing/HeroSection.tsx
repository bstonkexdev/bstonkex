// Cupcak8 — Hero Section
// Brand name, tagline, description — compact, no CTA buttons
export default function HeroSection() {
  return (
    <section style={{
      padding: 'clamp(28px, 6vw, 48px) 20px clamp(24px, 5vw, 40px)',
      textAlign: 'center', position: 'relative',
      background: 'linear-gradient(180deg, #FFF8F0 0%, #FFECD2 60%, #FFF8F0 100%)',
      borderBottom: '2px solid var(--border)', overflow: 'hidden',
    }}>
      {/* Pixel grid decoration */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.03, pointerEvents: 'none',
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 15px, #3D2B1F 15px, #3D2B1F 16px), repeating-linear-gradient(90deg, transparent, transparent 15px, #3D2B1F 15px, #3D2B1F 16px)' }} />

      <div style={{ position: 'relative', maxWidth: 600, margin: '0 auto' }}>
        <h1 style={{
          fontFamily: 'var(--font-pixel)', fontSize: 'clamp(18px, 5vw, 28px)', color: '#3D2B1F',
          margin: '0 0 6px', lineHeight: 1.4, letterSpacing: '0.02em',
        }}>
          Cupcak8
        </h1>
        <p style={{
          fontFamily: 'var(--font-pixel)', fontSize: 'clamp(9px, 2vw, 11px)', color: '#E8547C',
          margin: '0 0 14px', letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>
          Sweet Looks. Serious Trading.
        </p>
        <p style={{
          fontSize: 'clamp(12px, 2.5vw, 14px)', color: '#5C3D2E', maxWidth: 460, margin: '0 auto',
          lineHeight: 1.7, fontWeight: 500,
        }}>
          Discover new tokens, track multichain markets, and trade your favorite assets from one terminal.
        </p>
      </div>
    </section>
  );
}