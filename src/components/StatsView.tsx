"use client";

import { useState } from "react";
import Link from "next/link";
import { PageTitle, SectionLabel } from "./AppShell";
import { announce } from "./Announcer";
import { RecentTable, categoryLabel } from "./RecentRuns";
import { Dialog } from "./Dialog";
import { describeFei, formatFei } from "@/lib/game/scoring";
import { aggregateStats } from "@/lib/storage/schema";
import { resetAllData, useStoredData } from "@/lib/storage/store";

const DASH = "–";

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
    <div>
      <PageTitle eyebrow="This device">Statistics</PageTitle>

      <section aria-labelledby="totals-heading" className="mt-8 border-t border-ink pt-5">
        <SectionLabel id="totals-heading">
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

      <section aria-labelledby="records-heading" className="mt-12 border-t border-ink pt-5">
        <SectionLabel id="records-heading">
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

      <section aria-labelledby="recent-heading" className="mt-12 border-t border-ink pt-5">
        <SectionLabel id="recent-heading">
          Recent runs
        </SectionLabel>
        {data ? <RecentTable recent={data.recent} /> : null}
      </section>

      <p className="mt-12 text-small text-ink-2">
        <Link href="/help#scoring" className="link">
          How scoring works
        </Link>
      </p>

      <section aria-labelledby="data-heading" className="mt-12 border-t border-ink pt-5">
        <SectionLabel id="data-heading">
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
