"use client";

/**
 * Automatic daily posting.
 *
 * After every finished attempt the client posts its best run so far, with
 * the number of finished attempts. The server keeps the better of what it
 * has and what arrives, and ignores a repeat of an attempt number it has
 * already counted, so posting is safe to retry at any time: a dropped
 * connection never costs a score and never counts twice.
 */
import { useEffect, useSyncExternalStore } from "react";
import { announce } from "@/components/Announcer";
import type { Division } from "@/lib/game/rules";
import { describeFei } from "@/lib/game/scoring";
import { DISPLAY_NAME_PATTERN, bestAttempt, dailyKey, finishedAttempts, needsPost } from "@/lib/storage/schema";
import { getData, updateData, useStoredData } from "@/lib/storage/store";
import { createValueStore } from "@/lib/valueStore";
import { LeaderboardUnavailableError, leaderboardService, type LeaderboardService } from "./client";
import type { BackendInfo } from "./types";

export type PostPhase =
  | { kind: "idle" }
  | { kind: "posting" }
  | { kind: "posted"; rank: number | null; backend: BackendInfo | null }
  | { kind: "unreachable" }
  | { kind: "rejected"; reason: string }
  | { kind: "needs-name" };

const phases = createValueStore<Record<string, PostPhase>>({});
const inFlight = new Map<string, Promise<void>>();

function setPhase(key: string, phase: PostPhase) {
  phases.set({ ...phases.get(), [key]: phase });
}

/** Post the best finished run of the day, if the leaderboard is behind. */
export function postDailyBest(
  dateKey: string,
  division: Division,
  service: LeaderboardService = leaderboardService,
): Promise<void> {
  const key = dailyKey(dateKey, division);
  const running = inFlight.get(key);
  if (running) return running;

  const job = (async () => {
    const data = getData();
    const entry = data.daily[key];
    if (!entry || !needsPost(entry)) return;
    const best = bestAttempt(entry);
    if (!best) return;
    const name = data.settings.displayName;
    if (!DISPLAY_NAME_PATTERN.test(name)) {
      setPhase(key, { kind: "needs-name" });
      return;
    }
    const attempt = finishedAttempts(entry).length;
    setPhase(key, { kind: "posting" });
    try {
      const res = await service.submit({
        dateKey,
        division,
        playerId: data.playerId,
        displayName: name,
        answers: best.attempt.answers,
        attempt,
        run: best.run,
      });
      if (res.status === "rejected") {
        setPhase(key, { kind: "rejected", reason: res.reason });
        announce("The leaderboard did not accept this run.", "assertive");
        return;
      }
      const rank = res.entry?.rank ?? null;
      updateData((d) => {
        const current = d.daily[key];
        if (!current) return d;
        return {
          ...d,
          daily: { ...d.daily, [key]: { ...current, postedAttempts: Math.max(current.postedAttempts, attempt), rank } },
        };
      });
      setPhase(key, { kind: "posted", rank, backend: res.backend });
      announce(
        `Posted to today's leaderboard. Your best, ${describeFei(res.bestFeiMs)}, ${rank ? `ranks number ${rank}` : "is on the board"}.`,
      );
    } catch (err) {
      setPhase(key, { kind: "unreachable" });
      if (!(err instanceof LeaderboardUnavailableError)) console.error(err);
    }
  })();

  inFlight.set(key, job);
  return job.finally(() => inFlight.delete(key));
}

/**
 * Posting state for one day and division. Starts a post whenever a finished
 * attempt has not reached the leaderboard yet, including runs left behind
 * by an earlier visit that could not connect.
 */
export function useDailyPost(dateKey: string, division: Division) {
  const key = dailyKey(dateKey, division);
  const all = useSyncExternalStore(phases.subscribe, phases.get, () => ({}) as Record<string, PostPhase>);
  const entry = useStoredData()?.daily[key];
  const pending = needsPost(entry);

  useEffect(() => {
    if (pending) void postDailyBest(dateKey, division);
  }, [pending, dateKey, division]);

  let phase: PostPhase = all[key] ?? { kind: "idle" };
  if (phase.kind === "idle" && entry && !pending && entry.postedAttempts > 0) {
    phase = { kind: "posted", rank: entry.rank, backend: null };
  }
  return { phase, retry: () => void postDailyBest(dateKey, division) };
}
