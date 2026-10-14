import type { TokenId } from "@/lib/game/tokens";

/**
 * The eight token silhouettes, drawn on a 100 x 100 grid in currentColor.
 * All are solid shapes with clearly different outlines, so they stay
 * distinguishable at small sizes, in either theme and without colour.
 */

function starPoints(): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 47 : 19;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(2)},${(54 + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

const STAR = starPoints();

const SHAPES: Record<TokenId, React.ReactNode> = {
  circle: <circle cx="50" cy="50" r="42" />,
  square: <rect x="12" y="12" width="76" height="76" />,
  triangle: <polygon points="50,8 94,86 6,86" />,
  diamond: <polygon points="50,4 96,50 50,96 4,50" />,
  cross: <path d="M37 6h26v31h31v26H63v31H37V63H6V37h31z" />,
  bars: (
    <>
      <rect x="8" y="12" width="84" height="18" />
      <rect x="8" y="41" width="84" height="18" />
      <rect x="8" y="70" width="84" height="18" />
    </>
  ),
  star: <polygon points={STAR} />,
  arc: <path d="M4 74 A46 46 0 0 1 96 74 Z" />,
};

export function TokenGlyph({ token, className }: { token: TokenId; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="currentColor" aria-hidden="true" focusable="false">
      {SHAPES[token]}
    </svg>
  );
}
