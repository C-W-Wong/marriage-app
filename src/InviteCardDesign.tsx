import { toPng } from 'html-to-image';

export const BASE_DOMAIN = 'chris-eileen.com';
export const CARD_W = 500;
export const CARD_H = 700;

const Flourish = ({ flip = false }: { flip?: boolean }) => (
  <svg
    viewBox="0 0 200 24"
    style={{ transform: flip ? 'scaleX(-1)' : undefined }}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M100 12 C85 12 78 4 60 4 C42 4 36 12 20 12 C14 12 8 10 2 8 M100 12 C85 12 78 20 60 20 C42 20 36 12 20 12"
      stroke="url(#flourishGrad)"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
    <path
      d="M100 12 C90 6 80 2 68 2 C52 2 44 10 30 10"
      stroke="url(#flourishGrad)"
      strokeWidth="0.8"
      strokeLinecap="round"
      opacity="0.6"
    />
    <circle cx="100" cy="12" r="2" fill="#c5a059" />
    <circle cx="20" cy="12" r="1.5" fill="#c5a059" opacity="0.5" />
    <defs>
      <linearGradient id="flourishGrad" x1="0" y1="0" x2="200" y2="0">
        <stop offset="0%" stopColor="#c5a059" stopOpacity="0.3" />
        <stop offset="50%" stopColor="#c5a059" stopOpacity="1" />
        <stop offset="100%" stopColor="#c5a059" stopOpacity="0.3" />
      </linearGradient>
    </defs>
  </svg>
);

const CornerOrnament = ({ position }: { position: 'tl' | 'tr' | 'bl' | 'br' }) => {
  const rotations = { tl: '0', tr: '90', br: '180', bl: '270' };
  return (
    <svg
      viewBox="0 0 48 48"
      style={{
        position: 'absolute',
        width: '48px',
        height: '48px',
        ...(position.includes('t') ? { top: '12px' } : { bottom: '12px' }),
        ...(position.includes('l') ? { left: '12px' } : { right: '12px' }),
        transform: `rotate(${rotations[position]}deg)`,
      }}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M4 4 L4 20 C4 12 12 4 20 4 L4 4Z" stroke="#c5a059" strokeWidth="1" fill="none" />
      <path d="M4 4 L4 14 C4 9 9 4 14 4 L4 4Z" stroke="#c5a059" strokeWidth="0.7" fill="#c5a059" opacity="0.12" />
      <circle cx="6" cy="6" r="1.5" fill="#c5a059" opacity="0.6" />
      <path d="M4 24 C4 14 8 8 16 4" stroke="#c5a059" strokeWidth="0.5" opacity="0.4" />
      <path d="M24 4 C14 4 8 8 4 16" stroke="#c5a059" strokeWidth="0.5" opacity="0.4" />
    </svg>
  );
};

const DiamondDivider = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
    <div style={{ height: '1px', width: '80px', background: 'linear-gradient(to right, transparent, rgba(197,160,89,0.6))' }} />
    <div style={{ width: '6px', height: '6px', transform: 'rotate(45deg)', backgroundColor: 'rgba(197,160,89,0.7)' }} />
    <div style={{ height: '1px', width: '80px', background: 'linear-gradient(to left, transparent, rgba(197,160,89,0.6))' }} />
  </div>
);

const FlourishDivider = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
    <Flourish flip />
    <div style={{ width: '6px', height: '6px', transform: 'rotate(45deg)', backgroundColor: '#c5a059', margin: '0 4px', flexShrink: 0 }} />
    <Flourish />
  </div>
);

export function CardDesign({ slug }: { slug: string }) {
  const fullUrl = `https://${BASE_DOMAIN}/invite/${slug}`;

  return (
    <div
      style={{
        width: `${CARD_W}px`,
        height: `${CARD_H}px`,
        position: 'relative',
        borderRadius: '2px',
        overflow: 'hidden',
        background: `
          radial-gradient(ellipse at 30% 20%, rgba(197,160,89,0.04) 0%, transparent 50%),
          radial-gradient(ellipse at 70% 80%, rgba(197,160,89,0.03) 0%, transparent 50%),
          linear-gradient(175deg, #fdfaf6 0%, #faf5ed 50%, #f7f1e7 100%)
        `,
        fontFamily: '"Cormorant Garamond", serif',
      }}
    >
      {/* Paper texture */}
      <div
        style={{
          position: 'absolute', inset: 0, opacity: 0.03, pointerEvents: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundSize: '200px',
        }}
      />

      {/* Gold borders */}
      <div style={{ position: 'absolute', inset: '16px', border: '1px solid rgba(197,160,89,0.3)', borderRadius: '1px', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: '22px', border: '1px solid rgba(197,160,89,0.15)', borderRadius: '1px', pointerEvents: 'none' }} />

      <CornerOrnament position="tl" />
      <CornerOrnament position="tr" />
      <CornerOrnament position="bl" />
      <CornerOrnament position="br" />

      <div
        style={{
          position: 'relative', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', height: '100%',
          padding: '40px 48px', textAlign: 'center', zIndex: 10,
        }}
      >
        {/* Elegant header */}
        <p style={{ color: '#c5a059', letterSpacing: '0.4em', fontSize: '8px', textTransform: 'uppercase', fontWeight: 500 }}>
          Together with their families and friends
        </p>

        <div style={{ marginTop: '10px' }}><FlourishDivider /></div>

        {/* Names on one line */}
        <div style={{ marginTop: '28px', display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '14px' }}>
          <h1 style={{ color: '#1a1a1a', fontSize: '42px', fontWeight: 300, letterSpacing: '0.04em', lineHeight: 1 }}>Chris</h1>
          <span style={{ color: '#c5a059', fontSize: '28px', fontWeight: 300, fontStyle: 'italic', lineHeight: 1 }}>&amp;</span>
          <h1 style={{ color: '#1a1a1a', fontSize: '42px', fontWeight: 300, letterSpacing: '0.04em', lineHeight: 1 }}>Eileen</h1>
        </div>

        <div style={{ marginTop: '28px' }}><DiamondDivider /></div>

        <p style={{ marginTop: '22px', color: 'rgba(26,26,26,0.55)', fontSize: '9px', letterSpacing: '0.25em', textTransform: 'uppercase' }}>
          Requesting the honor of your presence
        </p>
        <p style={{ marginTop: '5px', color: 'rgba(26,26,26,0.4)', fontSize: '11px', letterSpacing: '0.1em', fontStyle: 'italic' }}>
          in the celebration of our marriage
        </p>

        {/* Date & Time */}
        <div style={{ marginTop: '28px' }}>
          <p style={{ color: '#c5a059', fontSize: '9px', letterSpacing: '0.4em', textTransform: 'uppercase', fontWeight: 500 }}>Tuesday</p>
          <p style={{ color: '#1a1a1a', fontSize: '30px', fontWeight: 300, letterSpacing: '0.06em', marginTop: '8px', lineHeight: 1 }}>
            May 20th, 2026
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginTop: '10px' }}>
            <div style={{ height: '1px', width: '24px', backgroundColor: 'rgba(197,160,89,0.4)' }} />
            <p style={{ color: 'rgba(26,26,26,0.6)', fontSize: '12px', letterSpacing: '0.15em' }}>8:20 in the morning</p>
            <div style={{ height: '1px', width: '24px', backgroundColor: 'rgba(197,160,89,0.4)' }} />
          </div>
        </div>

        <div style={{ marginTop: '22px' }}><DiamondDivider /></div>

        {/* Venue */}
        <div style={{ marginTop: '22px' }}>
          <p style={{ color: '#1a1a1a', fontSize: '14px', letterSpacing: '0.08em', fontWeight: 500 }}>Old Orange County Courthouse</p>
          <p style={{ marginTop: '5px', color: 'rgba(26,26,26,0.4)', fontSize: '10px', letterSpacing: '0.06em', lineHeight: 1.7 }}>
            211 West Santa Ana Boulevard<br />Santa Ana, California
          </p>
        </div>

        <div style={{ marginTop: '20px' }}><FlourishDivider /></div>

        {/* Invite link — optimized for iOS Live Text OCR */}
        <div style={{ marginTop: '16px' }}>
          <p style={{ color: 'rgba(197,160,89,0.7)', fontSize: '7px', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '8px' }}>
            Kindly respond
          </p>
          <a
            href={fullUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block', color: '#1a1a1a', fontSize: '13px',
              fontFamily: '"Inter", sans-serif', fontWeight: 400, letterSpacing: '0.01em',
              textDecoration: 'none', padding: '5px 16px',
              border: '1px solid rgba(197,160,89,0.25)',
              borderRadius: '2px', background: 'rgba(255,255,255,0.9)',
            }}
          >
            {fullUrl}
          </a>
        </div>

        {/* Monogram — interlinked rings with initials */}
        <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0' }}>
          <div style={{ height: '1px', width: '32px', background: 'linear-gradient(to right, transparent, rgba(197,160,89,0.35))' }} />
          <svg viewBox="0 0 80 28" style={{ width: '80px', height: '28px' }} fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Left ring */}
            <ellipse cx="28" cy="14" rx="12" ry="12" stroke="#c5a059" strokeWidth="0.7" opacity="0.4" />
            {/* Right ring — overlapping */}
            <ellipse cx="52" cy="14" rx="12" ry="12" stroke="#c5a059" strokeWidth="0.7" opacity="0.4" />
            {/* C initial */}
            <text x="28" y="18" textAnchor="middle" fill="#c5a059" opacity="0.6" fontSize="11" fontFamily="Cormorant Garamond, serif" fontWeight="300">C</text>
            {/* E initial */}
            <text x="52" y="18" textAnchor="middle" fill="#c5a059" opacity="0.6" fontSize="11" fontFamily="Cormorant Garamond, serif" fontWeight="300">E</text>
            {/* Small heart at intersection */}
            <path d="M40 11 C40 9.5 38.5 8 37 9.2 C37 9.2 40 12.5 40 12.5 C40 12.5 43 9.2 43 9.2 C41.5 8 40 9.5 40 11Z" fill="#c5a059" opacity="0.35" />
          </svg>
          <div style={{ height: '1px', width: '32px', background: 'linear-gradient(to left, transparent, rgba(197,160,89,0.35))' }} />
        </div>
      </div>
    </div>
  );
}

export async function generateCardPng(node: HTMLElement): Promise<string> {
  return toPng(node, {
    width: CARD_W * 2,
    height: CARD_H * 2,
    pixelRatio: 2,
    cacheBust: true,
    style: { transform: 'scale(2)', transformOrigin: 'top left' },
  });
}



