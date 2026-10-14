"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { formatCountdown, msUntilNextUtcDay, utcDateKey } from "@/lib/game/daily";
import { isDivision, type Division } from "@/lib/game/rules";
import { describeFei, formatFei } from "@/lib/game/scoring";
import { leaderboardService } from "@/lib/leaderboard/client";
import type { LeaderboardEntry, LeaderboardPeriod, LeaderboardSnapshot } from "@/lib/leaderboard/types";
import { useStoredData } from "@/lib/storage/store";

type Load =
  | { kind: "loading" }
  | { kind: "ready"; snapshot: LeaderboardSnapshot }
  | { kind: "error" };

type Settled = { key: string; kind: "ready"; snapshot: LeaderboardSnapshot } | { key: string; kind: "error" };

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex border border-ink">
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-11 px-4 text-small font-medium ${i > 0 ? "border-l border-ink" : ""} ${
            value === o.value ? "bg-ink text-canvas" : "text-ink hover:bg-surface"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Row({ e, pinned = false }: { e: LeaderboardEntry; pinned?: boolean }) {
  return (
    <tr className={`border-b border-rule ${e.isPlayer ? "bg-surface font-semibold" : ""} ${pinned ? "border-t-2 border-t-ink" : ""}`}>
      <td className="num py-3 pr-4">
        {String(e.rank).padStart(2, "0")}
      </td>
      <th scope="row" className="py-3 pr-4 text-left font-[inherit]">
        {e.displayName}
        {e.isPlayer ? <span className="label ml-2 border border-ink px-1.5 py-0.5 !text-ink">You</span> : null}
      </th>
      <td className="num py-3 pr-4 text-right">
        <span aria-hidden="true">{formatFei(e.feiMs)}</span>
        <span className="sr-only">{describeFei(e.feiMs)}</span>
      </td>
      <td className="num py-3 pr-4 text-right">{e.completed}</td>
      <td className="num py-3 text-right">{e.maxLength}</td>
    </tr>
  );
}

export function Leaderboard() {
  const params = useSearchParams();
  const data = useStoredData();
  const initialDivision = params.get("division");
  const [period, setPeriod] = useState<LeaderboardPeriod>(params.get("period") === "all-time" ? "all-time" : "daily");
  const [division, setDivision] = useState<Division>(isDivision(initialDivision) ? initialDivision : "standard");
  const [settled, setSettled] = useState<Settled | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [today, setToday] = useState<string | null>(null);
  const [resetIn, setResetIn] = useState<string | null>(null);
  const playerId = data?.playerId ?? null;

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setToday(utcDateKey(now));
      setResetIn(formatCountdown(msUntilNextUtcDay(now)));
    };
    update();
    const id = window.setInterval(update, 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Each request has a key; anything settled under an older key reads as loading.
  const requestKey = `${period}|${division}|${today}|${playerId}|${attempt}`;
  useEffect(() => {
    if (!today || !playerId) return;
    const ctrl = new AbortController();
    leaderboardService
      .fetchBoard({ period, dateKey: period === "daily" ? today : null, division, playerId }, ctrl.signal)
      .then((snapshot) => setSettled({ key: requestKey, kind: "ready", snapshot }))
      .catch(() => {
        if (!ctrl.signal.aborted) setSettled({ key: requestKey, kind: "error" });
      });
    return () => ctrl.abort();
  }, [period, division, today, playerId, requestKey]);
  const load: Load = settled && settled.key === requestKey ? settled : { kind: "loading" };

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const snap = load.kind === "ready" ? load.snapshot : null;
  const pinned = snap?.player && !snap.entries.some((e) => e.isPlayer) ? snap.player : null;

  return (
    <div className="pt-12 sm:pt-16">
      <p className="label">Rankings</p>
      <h1 className="mt-3 text-display font-semibold">Leaderboard</h1>

      <div className="mt-10 flex flex-wrap items-end justify-between gap-4 border-t border-ink pt-5">
        <p className="text-ink-2">
          {period === "daily" ? (
            <>
              Daily challenge <span className="num text-ink">{today ?? ""}</span> UTC
              {resetIn ? (
                <>
                  {" "}· closes in <span className="num text-ink">{resetIn}</span>
                </>
              ) : null}
            </>
          ) : (
            "All-time: each player's single best daily run"
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <Segmented
            label="Period"
            value={period}
            onChange={setPeriod}
            options={[
              { value: "daily", label: "Today" },
              { value: "all-time", label: "All-time" },
            ]}
          />
          <Segmented
            label="Division"
            value={division}
            onChange={setDivision}
            options={[
              { value: "standard", label: "Visual" },
              { value: "spoken", label: "Spoken" },
            ]}
          />
        </div>
      </div>

      {snap?.backend.isPreview ? (
        <p role="note" className="mt-6 border-l-2 border-signal pl-4">
          <strong className="font-semibold">Preview leaderboard.</strong>{" "}
          <span className="text-ink-2">
            {snap.backend.label} Rankings here are not global. See the README to connect a shared backend.
          </span>
        </p>
      ) : null}

      <div className="mt-6 overflow-x-auto" aria-busy={load.kind === "loading"}>
        {load.kind === "error" ? (
          <div role="alert" className="border border-line p-6">
            <p className="font-semibold">The leaderboard could not be reached.</p>
            <p className="mt-1 text-ink-2">Your own results are still saved on this device. Practice works offline.</p>
            <button type="button" className="btn btn-secondary mt-4" onClick={retry}>
              <RotateCcw aria-hidden="true" className="size-4" />
              Try again
            </button>
          </div>
        ) : (
          <table className="w-full min-w-[32rem] border-collapse text-left">
            <caption className="sr-only">
              {period === "daily" ? `Daily ranking for ${today ?? "today"}` : "All-time ranking"},{" "}
              {division === "spoken" ? "spoken" : "visual"} division.
              {snap ? ` ${snap.total} player${snap.total === 1 ? "" : "s"}.` : " Loading."}
            </caption>
            <thead>
              <tr className="border-b border-ink">
                <th scope="col" className="label w-16 py-2 pr-4 font-normal">Rank</th>
                <th scope="col" className="label py-2 pr-4 font-normal">Player</th>
                <th scope="col" className="label py-2 pr-4 text-right font-normal">FEI</th>
                <th scope="col" className="label py-2 pr-4 text-right font-normal">Challenges</th>
                <th scope="col" className="label py-2 text-right font-normal">Longest</th>
              </tr>
            </thead>
            <tbody>
              {load.kind === "loading"
                ? Array.from({ length: 5 }, (_, i) => (
                    <tr key={i} className="border-b border-rule" aria-hidden="true">
                      {[2, 10, 5, 3, 3].map((w, j) => (
                        <td key={j} className="py-3.5 pr-4">
                          <span className={`block h-3 bg-rule ${j >= 2 ? "ml-auto" : ""}`} style={{ width: `${w}ch` }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : null}
              {snap?.entries.map((e) => <Row key={`${e.rank}-${e.displayName}`} e={e} />)}
              {pinned ? <Row e={pinned} pinned /> : null}
            </tbody>
          </table>
        )}
        {snap && snap.entries.length === 0 ? (
          <div className="border-b border-rule py-10">
            <p className="font-semibold">{period === "daily" ? "No runs posted for today yet." : "No runs posted yet."}</p>
            <p className="mt-1 text-ink-2">
              Play today&apos;s challenge and post your score to open the board.{" "}
              <Link href="/play?mode=daily" className="link">
                Play the daily challenge
              </Link>
            </p>
          </div>
        ) : null}
      </div>

      <section aria-labelledby="ranking-rules" className="mt-12 max-w-[42rem]">
        <h2 id="ranking-rules" className="label !text-ink">How ranking works</h2>
        <p className="mt-2 text-ink-2">
          Only daily challenge runs are ranked, one per player per division per day. Your browser sends the answers you
          entered, never a score: the server regenerates today&apos;s sequences, replays your answers and computes the FEI
          itself. Ties are broken by challenges completed, then by who posted first. Spoken and visual runs use different
          timing floors, so they are ranked separately.
        </p>
      </section>
    </div>
  );
}
