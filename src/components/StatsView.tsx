"use client";

import { useState } from "react";
import { SectionLabel } from "./AppShell";
import { announce } from "./Announcer";
import { RecentTable, categoryLabel } from "./Dashboard";
import { Dialog } from "./Dialog";
import { STANDARD_RULES, difficultyFor } from "@/lib/game/rules";
import { describeFei, formatDuration, formatFei } from "@/lib/game/scoring";
import { aggregateStats } from "@/lib/storage/schema";
import { resetAllData, useStoredData } from "@/lib/storage/store";

const DASH = "–";

export function ScoringExplainer() {
  const rows = [0, 1, 2, 3, 4].map((c) => {
    const d = difficultyFor(STANDARD_RULES, c);
    return { n: c + 1, ...d, ms: d.length * d.durationMs };
  });
  let running = 0;
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="max-w-[36rem]">
        <p className="num border border-ink p-4 text-[1.0625rem] leading-relaxed">
          FEI = &Sigma; (sequence length &times; time per token)
          <br />
          <span className="text-ink-2">over every correctly completed challenge</span>
        </p>
        <ul className="mt-5 grid gap-2 text-ink-2">
          <li>A challenge adds its presentation time only once its whole sequence is submitted in the right order.</li>
          <li>Waiting before you submit, pausing, or switching tabs adds nothing. The score comes from the schedule, not the clock.</li>
          <li>An incorrect challenge adds nothing and ends the run.</li>
          <li>
            Sequences start at {STANDARD_RULES.initialLength} tokens for {formatDuration(STANDARD_RULES.initialDurationMs)} each,
            gain a token every {STANDARD_RULES.lengthEvery} challenges up to {STANDARD_RULES.maxLength}, and speed up by 0.1 s every{" "}
            {STANDARD_RULES.durationEvery} challenges down to {formatDuration(STANDARD_RULES.minDurationMs)}. The spoken division
            stops at 1.0 s so words are never cut off.
          </li>
          <li>
            FEI is a game score: the presentation time you held and rebuilt under these rules. It is not a measurement of
            attention or of any cognitive ability.
          </li>
        </ul>
      </div>
      <table className="w-full max-w-[28rem] self-start border-collapse text-left">
        <caption className="label mb-2 text-left !text-ink">Worked example: the first five challenges</caption>
        <thead>
          <tr className="border-b border-ink">
            <th scope="col" className="label py-2 pr-3 font-normal">Ch</th>
            <th scope="col" className="label py-2 pr-3 text-right font-normal">Length</th>
            <th scope="col" className="label py-2 pr-3 text-right font-normal">Each</th>
            <th scope="col" className="label py-2 pr-3 text-right font-normal">Adds</th>
            <th scope="col" className="label py-2 text-right font-normal">FEI</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            running += r.ms;
            return (
              <tr key={r.n} className="border-b border-rule">
                <td className="num py-2 pr-3">{String(r.n).padStart(2, "0")}</td>
                <td className="num py-2 pr-3 text-right">{r.length}</td>
                <td className="num py-2 pr-3 text-right">{formatDuration(r.durationMs)}</td>
                <td className="num py-2 pr-3 text-right">{(r.ms / 1000).toFixed(1)} s</td>
                <td className="num py-2 text-right">{formatFei(running)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function StatsView() {
  const data = useStoredData();
  const [confirm, setConfirm] = useState(false);
  const agg = data ? aggregateStats(data) : null;
  const categories = data ? Object.entries(data.stats).sort(([a], [b]) => a.localeCompare(b)) : [];
  const ranked = data?.stats["daily:standard"];
  const bestPractice = categories
    .filter(([k]) => k.startsWith("practice:"))
    .reduce<number | null>((m, [, s]) => (m === null || s.bestFeiMs > m ? s.bestFeiMs : m), null);

  const totals = [
    { label: "Ranked best (visual)", value: ranked && ranked.runs ? formatFei(ranked.bestFeiMs) : DASH, sr: ranked && ranked.runs ? describeFei(ranked.bestFeiMs) : "none" },
    { label: "Practice best (any level)", value: bestPractice !== null ? formatFei(bestPractice) : DASH, sr: bestPractice !== null ? describeFei(bestPractice) : "none" },
    { label: "Best streak", value: agg && agg.bestStreak ? String(agg.bestStreak) : DASH },
    { label: "Challenges completed", value: agg ? String(agg.completedChallenges) : DASH },
    { label: "Practice sessions", value: agg ? String(agg.practiceSessions) : DASH },
    { label: "Daily runs", value: agg ? String(agg.dailyRuns) : DASH },
  ];

  return (
    <div className="pt-12 sm:pt-16">
      <p className="label">This device</p>
      <h1 className="mt-3 text-display font-semibold">Statistics</h1>

      <section aria-labelledby="totals-heading" className="mt-10 border-t border-ink pt-5">
        <SectionLabel index="01" id="totals-heading">
          Totals
        </SectionLabel>
        <dl className="mt-5 grid grid-cols-2 gap-px bg-rule sm:grid-cols-3">
          {totals.map((t) => (
            <div key={t.label} className="bg-canvas py-4 pr-4">
              <dt className="label">{t.label}</dt>
              <dd className="num mt-1 text-metric">
                {t.sr ? (
                  <>
                    <span aria-hidden="true">{t.value}</span>
                    <span className="sr-only">{t.sr}</span>
                  </>
                ) : (
                  t.value
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="records-heading" className="mt-16 border-t border-ink pt-5">
        <SectionLabel index="02" id="records-heading">
          Records by mode
        </SectionLabel>
        {categories.length === 0 ? (
          <p className="mt-4 text-ink-2">No records yet. Each mode keeps its own records, so practice never mixes with ranked play.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-left">
              <caption className="sr-only">Personal records for each mode</caption>
              <thead>
                <tr className="border-b border-ink">
                  <th scope="col" className="label py-2 pr-4 font-normal">Mode</th>
                  <th scope="col" className="label py-2 pr-4 text-right font-normal">Best FEI</th>
                  <th scope="col" className="label py-2 pr-4 text-right font-normal">Best streak</th>
                  <th scope="col" className="label py-2 pr-4 text-right font-normal">Longest</th>
                  <th scope="col" className="label py-2 text-right font-normal">Runs</th>
                </tr>
              </thead>
              <tbody>
                {categories.map(([k, s]) => (
                  <tr key={k} className="border-b border-rule">
                    <th scope="row" className="py-2.5 pr-4 text-left font-normal">{categoryLabel(k)}</th>
                    <td className="num py-2.5 pr-4 text-right">{formatFei(s.bestFeiMs)}</td>
                    <td className="num py-2.5 pr-4 text-right">{s.bestStreak}</td>
                    <td className="num py-2.5 pr-4 text-right">{s.bestLength}</td>
                    <td className="num py-2.5 text-right">{s.runs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="recent-heading" className="mt-16 border-t border-ink pt-5">
        <SectionLabel index="03" id="recent-heading">
          Recent runs
        </SectionLabel>
        {data ? <RecentTable recent={data.recent} /> : null}
      </section>

      <section id="scoring" aria-labelledby="scoring-heading" className="mt-16 scroll-mt-8 border-t border-ink pt-5">
        <SectionLabel index="04" id="scoring-heading">
          How scoring works
        </SectionLabel>
        <div className="mt-5">
          <ScoringExplainer />
        </div>
      </section>

      <section aria-labelledby="data-heading" className="mt-16 border-t border-ink pt-5">
        <SectionLabel index="05" id="data-heading">
          Your data
        </SectionLabel>
        <p className="mt-3 max-w-[40rem] text-ink-2">
          Records and settings live in this browser&apos;s local storage. Nothing is sent anywhere unless you post a daily
          score, which sends your chosen name and your answers.
        </p>
        <button type="button" className="btn btn-secondary mt-4" onClick={() => setConfirm(true)}>
          Clear local records
        </button>
      </section>

      <Dialog open={confirm} onCancel={() => setConfirm(false)} labelledBy="clear-title" describedBy="clear-desc">
        <h2 id="clear-title" className="text-title font-semibold">Clear local records?</h2>
        <p id="clear-desc" className="mt-2 text-ink-2">
          This removes your statistics, recent runs and settings from this browser. Scores already posted to a
          leaderboard are not affected. Today&apos;s daily attempt still counts as used.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" data-autofocus className="btn btn-primary" onClick={() => setConfirm(false)}>
            Keep records
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              resetAllData();
              setConfirm(false);
              announce("Local records cleared.");
            }}
          >
            Clear records
          </button>
        </div>
      </Dialog>
    </div>
  );
}
