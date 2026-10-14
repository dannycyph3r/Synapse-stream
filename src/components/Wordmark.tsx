import Link from "next/link";

/**
 * The mark: a 3 x 3 field of nodes with one held path through four of them.
 * A pattern, traced and kept.
 */
export function Mark({ className }: { className?: string }) {
  const nodes = [6, 16, 26];
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <polyline
        points="6,26 16,16 26,16 26,6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      {nodes.flatMap((y) =>
        nodes.map((x) => {
          const held = (x === 6 && y === 26) || (x === 16 && y === 16) || (x === 26 && y === 16) || (x === 26 && y === 6);
          return <circle key={`${x}-${y}`} cx={x} cy={y} r={held ? 3.4 : 1.6} fill="currentColor" />;
        }),
      )}
    </svg>
  );
}

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5 py-2 text-ink" aria-label="Synapse Stream, home">
      <Mark className="size-7" />
      <span className="text-[1.0625rem] font-[640] tracking-[-0.025em] leading-none">
        Synapse<span className="font-[380]"> Stream</span>
      </span>
    </Link>
  );
}
