import { formatDuration, formatFei } from "@/lib/game/scoring";

export interface MetricsProps {
  challenge: number;
  length: number;
  durationMs: number;
  streak: number;
  feiMs: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The instrument strip. Fixed-width figures, so nothing shifts as values change. */
export function FocusMetrics({ challenge, length, durationMs, streak, feiMs }: MetricsProps) {
  const items = [
    { label: "Challenge", short: "Ch", value: pad(challenge) },
    { label: "Length", short: "Len", value: pad(length) },
    { label: "Rate", short: "Rate", value: formatDuration(durationMs), compact: formatDuration(durationMs).replace(" ", "") },
    { label: "Streak", short: "Strk", value: pad(streak) },
    { label: "Banked FEI", short: "FEI", value: formatFei(feiMs) },
  ];
  return (
    <dl className="grid grid-cols-[1fr_1fr_1fr_1fr_1.55fr] border-y border-ink">
      {items.map((item, i) => (
        <div key={item.label} className={`px-1.5 py-2 sm:px-3 ${i > 0 ? "border-l border-rule" : ""}`}>
          <dt className="label">
            <span className="sm:hidden" aria-hidden="true">
              {item.short}
            </span>
            <span className="max-sm:sr-only">{item.label}</span>
          </dt>
          <dd className={`num mt-0.5 whitespace-nowrap text-[1rem] leading-6 sm:text-[1.3rem] sm:leading-7 ${i === 4 ? "font-semibold" : ""}`}>
            {"compact" in item ? (
              <>
                <span className="sm:hidden">{item.compact}</span>
                <span className="max-sm:hidden">{item.value}</span>
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
