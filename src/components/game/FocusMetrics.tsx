import { describeFei, formatDuration, formatFei } from "@/lib/game/scoring";

export interface MetricsProps {
  /** The round on screen, or the coming round during the feedback beat. */
  challenge: number;
  length: number;
  durationMs: number;
  feiMs: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The instrument strip. Fixed-width figures, so nothing shifts as values
 * change. Streak is not shown: one miss ends a run, so it would always equal
 * the challenge number minus one.
 */
export function FocusMetrics({ challenge, length, durationMs, feiMs }: MetricsProps) {
  const items = [
    { label: "Round", value: pad(challenge) },
    { label: "Tokens", value: pad(length) },
    { label: "Each", value: formatDuration(durationMs) },
    { label: "FEI", value: formatFei(feiMs), sr: describeFei(feiMs) },
  ];
  return (
    <dl className="game-metrics grid grid-cols-[1fr_1fr_1fr_1.45fr] border-y border-ink">
      {items.map((item, i) => (
        <div key={item.label} className={`min-w-0 px-2 py-1.5 sm:px-3 ${i > 0 ? "border-l border-rule" : ""}`}>
          <dt className="label truncate">{item.label}</dt>
          <dd className={`num whitespace-nowrap text-[1.0625rem] leading-6 sm:text-[1.25rem] sm:leading-7 ${i === 3 ? "font-semibold" : ""}`}>
            {item.sr ? (
              <>
                <span aria-hidden="true">{item.value}</span>
                <span className="sr-only">{item.sr}</span>
              </>
            ) : (
              item.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
