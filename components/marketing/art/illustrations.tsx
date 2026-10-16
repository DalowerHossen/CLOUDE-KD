// path: components/marketing/art/illustrations.tsx
// Marketing illustration set (style guide: docs/steps/STEP-06/ART_GUIDE.md). Flat shapes, two tones taken from the
// theme tokens, no text inside the artwork, decorative only (aria-hidden), so they follow light, dark and high contrast.

type Kind = 'empty' | 'search' | 'document' | 'secure' | 'success' | 'error';

const PRIMARY = 'hsl(var(--primary))';
const SOFT = 'hsl(var(--primary) / 0.15)';
const LINE = 'hsl(var(--muted-foreground))';
const WARN = 'hsl(var(--destructive))';

function Shapes({ kind }: { kind: Kind }): JSX.Element {
  switch (kind) {
    case 'empty':
      return (
        <>
          <rect x="30" y="52" width="100" height="62" rx="8" fill={SOFT} />
          <path
            d="M30 70 L55 52 H105 L130 70"
            fill="none"
            stroke={PRIMARY}
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <rect
            x="30"
            y="70"
            width="100"
            height="44"
            rx="8"
            fill="none"
            stroke={PRIMARY}
            strokeWidth="4"
          />
          <path d="M62 70 h36" stroke={LINE} strokeWidth="4" strokeLinecap="round" />
        </>
      );
    case 'search':
      return (
        <>
          <circle cx="72" cy="64" r="34" fill={SOFT} stroke={PRIMARY} strokeWidth="6" />
          <path d="M98 90 L128 120" stroke={PRIMARY} strokeWidth="10" strokeLinecap="round" />
          <path d="M58 64 h28 M58 76 h18" stroke={LINE} strokeWidth="4" strokeLinecap="round" />
        </>
      );
    case 'document':
      return (
        <>
          <path
            d="M44 24 h50 l22 22 v70 a8 8 0 0 1 -8 8 H44 a8 8 0 0 1 -8 -8 V32 a8 8 0 0 1 8 -8z"
            fill={SOFT}
            stroke={PRIMARY}
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <path
            d="M94 24 v22 h22"
            fill="none"
            stroke={PRIMARY}
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <path
            d="M52 68 h48 M52 84 h48 M52 100 h28"
            stroke={LINE}
            strokeWidth="4"
            strokeLinecap="round"
          />
        </>
      );
    case 'secure':
      return (
        <>
          <path
            d="M80 18 L124 34 V70 C124 98 106 116 80 126 C54 116 36 98 36 70 V34z"
            fill={SOFT}
            stroke={PRIMARY}
            strokeWidth="5"
            strokeLinejoin="round"
          />
          <path
            d="M60 72 l14 14 l28 -30"
            fill="none"
            stroke={PRIMARY}
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );
    case 'success':
      return (
        <>
          <circle cx="80" cy="72" r="44" fill={SOFT} stroke={PRIMARY} strokeWidth="5" />
          <path
            d="M58 74 l16 16 l30 -34"
            fill="none"
            stroke={PRIMARY}
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );
    case 'error':
      return (
        <>
          <path
            d="M80 22 L132 116 H28z"
            fill="hsl(var(--destructive) / 0.12)"
            stroke={WARN}
            strokeWidth="5"
            strokeLinejoin="round"
          />
          <path d="M80 56 v30" stroke={WARN} strokeWidth="8" strokeLinecap="round" />
          <circle cx="80" cy="100" r="5" fill={WARN} />
        </>
      );
  }
}

/** A decorative illustration. Put the meaning in the text next to it, never in the picture. */
export function Illustration({ kind, className }: { kind: Kind; className?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 160 144"
      role="presentation"
      aria-hidden="true"
      focusable="false"
      className={className ?? 'h-32 w-auto'}
    >
      <Shapes kind={kind} />
    </svg>
  );
}

/** Soft background shapes for hero areas. Static, so it costs nothing at run time and respects reduced motion. */
export function HeroBackdrop(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-60"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 800 400"
    >
      <circle cx="680" cy="60" r="180" fill={SOFT} />
      <circle cx="120" cy="360" r="140" fill="hsl(var(--primary) / 0.08)" />
    </svg>
  );
}
