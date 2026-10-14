"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { SectionLabel } from "./AppShell";
import { TokenGlyph } from "./TokenGlyph";
import { formatCountdown, msUntilNextUtcDay, utcDateKey } from "@/lib/game/daily";
import { practiceLevel, type Division } from "@/lib/game/rules";
import { describeFei, formatFei } from "@/lib/game/scoring";
import { TOKENS } from "@/lib/game/tokens";
import { aggregateStats, dailyKey, type RecentResult, type StoredData } from "@/lib/storage/schema";
import { useStoredData } from "@/lib/storage/store";

const DASH = "–";

function Readout({ label, ms, note }: { label: string; ms: number | null; note: string }) {
  return (
    <div className="border-b border-rule py-4 first:pt-0">
      <dt className="label">{label}</dt>
      <dd className="mt-1.5">
        <span className="num block text-metric font-medium tracking-[-0.03em]">
          <span aria-hidden="true" className={ms === null ? "text-ink-2" : undefined}>
            {ms === null ? "--:--.-" : formatFei(ms)}
          </span>
          <span className="sr-only">{ms === null ? "No record yet" : describeFei(ms)}</span>
        </span>
        <span className="mt-1 block text-small text-ink-2">{note}</span>
      </dd>
    </div>
  );
}

export function categoryLabel(category: string): string {
  const [kind, division, level] = category.split(":");
  const d = division === "spoken" ? "Spoken" : "Visual";
  if (kind === "daily") return `Daily · ${d}`;
  return `Practice · ${level ? practiceLevel(level as never).label : ""} · ${d}`;
}

export function formatWhen(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(ms);
}

const ENDED: Record<RecentResult["endReason"], string> = {
  mismatch: "Mismatch",
  exited: "Exited",
  interrupted: "Interrupted",
};

export function RecentTable({ recent, limit }: { recent: RecentResult[]; limit?: number }) {
  const rows = limit ? recent.slice(0, limit) : recent;
  if (rows.length === 0) {
    return (
      <p className="mt-4 max-w-md text-ink-2">
        No runs yet. Finished runs appear here; nothing is recorded until a run ends.
      </p>
    );
  }
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[30rem] border-collapse text-left">
        <caption className="sr-only">Recent runs, newest first</caption>
        <thead>
          <tr className="border-b border-ink">
            <th scope="col" className="label py-2 pr-4 font-normal">When</th>
            <th scope="col" className="label py-2 pr-4 font-normal">Mode</th>
            <th scope="col" className="label py-2 pr-4 text-right font-normal">FEI</th>
            <th scope="col" className="label py-2 pr-4 text-right font-normal">Held</th>
            <th scope="col" className="label py-2 font-normal">Ended</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-rule">
              <td className="num py-2.5 pr-4 text-small">{formatWhen(r.endedAt)}</td>
              <td className="py-2.5 pr-4 text-small">{categoryLabel(r.category)}</td>
              <td className="num py-2.5 pr-4 text-right">{formatFei(r.feiMs)}</td>
              <td className="num py-2.5 pr-4 text-right">{r.completed}</td>
              <td className="py-2.5 text-small text-ink-2">{ENDED[r.endReason]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function useResetCountdown(): string | null {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const update = () => setText(formatCountdown(msUntilNextUtcDay(new Date())));
    update();
    const id = window.setInterval(update, 30_000);
    return () => window.clearInterval(id);
  }, []);
  return text;
}

function DailyPanel({ data }: { data: StoredData }) {
  const resetIn = useResetCountdown();
  const today = utcDateKey(new Date());
  const division: Division = data.settings.presentation === "spoken" ? "spoken" : "standard";
  const entry = data.daily[dailyKey(today, division)];

  return (
    <section aria-labelledby="daily-heading" className="grid gap-6 border-t border-ink pt-5 md:grid-cols-12">
      <div className="md:col-span-4">
        <SectionLabel index="02" id="daily-heading">
          Daily challenge
        </SectionLabel>
      </div>
      <div className="md:col-span-8">
        <p className="num text-[clamp(2rem,5vw,3rem)] font-medium leading-none tracking-[-0.03em]">
          {today}
          <span className="ml-3 align-middle text-small font-normal text-ink-2">UTC</span>
        </p>
        <p className="mt-3 max-w-[38rem] text-ink-2">
          The same sequences for every player until 00:00 UTC. One ranked attempt per division.
          {resetIn ? (
            <>
              {" "}
              Resets in <span className="num whitespace-nowrap text-ink">{resetIn}</span>.
            </>
          ) : null}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          {entry?.status === "finished" ? (
            <>
              <p>
                Done today: <span className="num font-semibold">{formatFei(entry.feiMs)}</span>
                <span className="text-ink-2">
                  {" "}
                  · {entry.completed} held · {entry.posted === "no" ? "not posted" : `posted${entry.rank ? `, rank #${entry.rank}` : ""}`}
                </span>
              </p>
              <Link href="/play?mode=daily" className="link">
                {entry.posted === "no" ? "Post your score" : "View today's run"}
              </Link>
            </>
          ) : entry?.status === "in-progress" ? (
            <Link href="/play?mode=daily" className="btn btn-primary">
              Record today&apos;s interrupted run
            </Link>
          ) : (
            <Link href="/play?mode=daily" className="btn btn-primary">
              Play today&apos;s challenge
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          )}
          <Link href="/leaderboard" className="link">
            Today&apos;s leaderboard
          </Link>
        </div>
        <p className="mt-3 text-small text-ink-2">
          Division: {division === "spoken" ? "Spoken" : "Visual"}.{" "}
          <Link href="/settings" className="link">
            Change
          </Link>
        </p>
      </div>
    </section>
  );
}

export function Dashboard() {
  const data = useStoredData();
  const level = data ? practiceLevel(data.settings.practiceLevel) : null;
  const rankedBest = data?.stats["daily:standard"];
  const practiceBest = data && level ? data.stats[`practice:standard:${level.id}`] : undefined;
  const agg = data ? aggregateStats(data) : null;
  const last = data?.recent[0];

  return (
    <>
      <section className="grid gap-x-10 gap-y-12 pb-16 pt-12 sm:pt-16 md:grid-cols-12">
        <div className="md:col-span-8">
          <p className="label">01 / Session</p>
          <h1 className="mt-5 text-display font-semibold">
            Enter the stream.
            <br />
            <span className="text-ink-2">Hold the pattern.</span>
          </h1>
          <p className="mt-8 max-w-[34rem] text-lead">
            A sequence-memory instrument. Watch a short stream of symbols, then rebuild it in the same order. Every
            stream you hold makes the next one longer and faster. One miss ends the run.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/play?mode=practice" className="btn btn-primary min-w-48">
              Begin session
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            <Link href="/stats#scoring" className="btn btn-quiet">
              How scoring works
            </Link>
          </div>
          <p className="mt-3 text-small text-ink-2">
            {level ? `Practice at ${level.label} level. ` : ""}No account needed.
          </p>
        </div>

        <aside aria-labelledby="records-heading" className="md:col-span-4 md:border-l md:border-rule md:pl-8">
          <h2 id="records-heading" className="label mb-4 !text-ink">
            Instrument readout
          </h2>
          {data ? (
            <dl>
              <Readout
                label="Personal best · Ranked"
                ms={rankedBest && rankedBest.runs > 0 ? rankedBest.bestFeiMs : null}
                note={rankedBest && rankedBest.runs > 0 ? `${rankedBest.runs} daily run${rankedBest.runs === 1 ? "" : "s"}, visual division` : "No ranked run yet"}
              />
              <Readout
                label={`Personal best · Practice${level ? ` ${level.label}` : ""}`}
                ms={practiceBest && practiceBest.runs > 0 ? practiceBest.bestFeiMs : null}
                note={practiceBest && practiceBest.runs > 0 ? `Best streak ${practiceBest.bestStreak}` : "No practice run at this level yet"}
              />
            </dl>
          ) : null}
          {data ? (
            <dl className="grid grid-cols-2 gap-4 pt-4">
              <div>
                <dt className="label">Last run</dt>
                <dd className="num mt-1 text-[1.25rem]">{last ? formatFei(last.feiMs) : DASH}</dd>
              </div>
              <div>
                <dt className="label">Best streak</dt>
                <dd className="num mt-1 text-[1.25rem]">{agg && agg.bestStreak > 0 ? agg.bestStreak : DASH}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-ink-2">Reading local records.</p>
          )}
        </aside>
      </section>

      {data ? <DailyPanel data={data} /> : null}

      <section aria-labelledby="recent-heading" className="mt-16 grid gap-6 border-t border-ink pt-5 md:grid-cols-12">
        <div className="md:col-span-4">
          <SectionLabel index="03" id="recent-heading">
            Recent runs
          </SectionLabel>
          <p className="mt-3 text-small text-ink-2">
            <Link href="/stats" className="link">
              All statistics
            </Link>
          </p>
        </div>
        <div className="md:col-span-8">{data ? <RecentTable recent={data.recent} limit={5} /> : null}</div>
      </section>

      <section aria-labelledby="tokens-heading" className="mt-16 grid gap-6 border-t border-ink pt-5 md:grid-cols-12">
        <div className="md:col-span-4">
          <SectionLabel index="04" id="tokens-heading">
            The eight tokens
          </SectionLabel>
          <p className="mt-3 max-w-xs text-small text-ink-2">
            Distinct silhouettes, never colour alone. Keys 1 to 8 select them during recall.
          </p>
        </div>
        <ul className="grid grid-cols-4 gap-px bg-rule md:col-span-8 lg:grid-cols-8">
          {TOKENS.map((t) => (
            <li key={t.id} className="grid place-items-center gap-2 bg-canvas px-2 py-5">
              <TokenGlyph token={t.id} className="size-9" />
              <span className="text-small">{t.label}</span>
              <span className="num text-[0.75rem] text-ink-2" aria-label={`key ${t.key}`}>
                {t.key}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
