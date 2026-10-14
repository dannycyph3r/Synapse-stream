"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { announce } from "@/components/Announcer";
import type { Division } from "@/lib/game/rules";
import { LeaderboardUnavailableError, leaderboardService } from "@/lib/leaderboard/client";
import type { BackendInfo } from "@/lib/leaderboard/types";
import { DISPLAY_NAME_PATTERN, dailyKey } from "@/lib/storage/schema";
import { updateData, useStoredData } from "@/lib/storage/store";

type Phase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "posted"; rank: number | null; backend: BackendInfo | null; duplicate: boolean }
  | { kind: "error"; message: string; retryable: boolean };

function nameError(name: string): string | null {
  const v = name.trim();
  if (v.length === 0) return "Enter a name to show on the leaderboard.";
  if (v.length < 2 || v.length > 20) return "Use between 2 and 20 characters.";
  if (!DISPLAY_NAME_PATTERN.test(v)) return "Use only letters, numbers, spaces, dots, dashes or underscores.";
  return null;
}

/**
 * Posting is an explicit choice: a ranked run is stored locally first and
 * only leaves the device when the player submits this form.
 */
export function PostScore({ dateKey, division }: { dateKey: string; division: Division }) {
  const data = useStoredData();
  const entry = data?.daily[dailyKey(dateKey, division)];
  const [name, setName] = useState(data?.settings.displayName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>(() =>
    entry && entry.posted !== "no"
      ? { kind: "posted", rank: entry.rank, backend: null, duplicate: entry.posted === "duplicate" }
      : { kind: "idle" },
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  if (!data || !entry || entry.status !== "finished") return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!data || !entry || phase.kind === "submitting") return;
    const problem = nameError(name);
    setError(problem);
    if (problem) {
      inputRef.current?.focus();
      return;
    }
    const displayName = name.trim().replace(/\s+/g, " ");
    setPhase({ kind: "submitting" });
    try {
      const res = await leaderboardService.submit({
        dateKey,
        division,
        playerId: data.playerId,
        displayName,
        answers: entry.answers,
      });
      if (res.status === "rejected") {
        setPhase({ kind: "error", message: `The leaderboard did not accept this run: ${res.reason}.`, retryable: false });
        announce("The score was not posted.", "assertive");
        return;
      }
      const rank = res.entry?.rank ?? null;
      const duplicate = res.status === "duplicate";
      updateData((d) => {
        const key = dailyKey(dateKey, division);
        const current = d.daily[key];
        if (!current) return d;
        return {
          ...d,
          settings: { ...d.settings, displayName },
          daily: { ...d.daily, [key]: { ...current, posted: duplicate ? "duplicate" : "posted", rank } },
        };
      });
      setPhase({ kind: "posted", rank, backend: res.backend, duplicate });
      announce(duplicate ? "A score for today was already posted." : `Posted. Rank ${rank ?? "unknown"}.`);
    } catch (err) {
      const message =
        err instanceof LeaderboardUnavailableError
          ? "The leaderboard could not be reached. Your result is safe on this device; try again in a moment."
          : "Something went wrong while posting. Your result is safe on this device.";
      setPhase({ kind: "error", message, retryable: true });
      announce("The score was not posted.", "assertive");
    }
  }

  const headingId = `${id}-heading`;

  if (phase.kind === "posted") {
    return (
      <section aria-labelledby={headingId} className="rule-top pt-5">
        <h2 id={headingId} className="label !text-ink">
          Leaderboard
        </h2>
        <p className="mt-2 text-lead">
          {phase.duplicate ? "Today's score was already posted from this device." : "Posted to today's board."}
          {phase.rank ? (
            <>
              {" "}
              Rank <span className="num font-semibold">#{phase.rank}</span>.
            </>
          ) : null}
        </p>
        {phase.backend?.isPreview ? <p className="mt-1 text-small text-ink-2">{phase.backend.label}</p> : null}
        <p className="mt-3">
          <Link href={`/leaderboard?division=${division}`} className="link">
            View the leaderboard
          </Link>
        </p>
      </section>
    );
  }

  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  return (
    <section aria-labelledby={headingId} className="rule-top pt-5">
      <h2 id={headingId} className="label !text-ink">
        Post to today&apos;s leaderboard
      </h2>
      <form onSubmit={onSubmit} noValidate className="mt-3 grid max-w-md gap-2">
        <label htmlFor={`${id}-name`} className="font-medium">
          Name on the leaderboard
        </label>
        <p id={hintId} className="text-small text-ink-2">
          Shown publicly. 2 to 20 letters, numbers, spaces, dots, dashes or underscores. The server
          recomputes your score from your answers.
        </p>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            id={`${id}-name`}
            name="displayName"
            autoComplete="nickname"
            spellCheck={false}
            maxLength={20}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${hintId}${error ? ` ${errorId}` : ""}`}
            className="min-h-12 min-w-0 flex-1 border border-line bg-surface px-3 text-ink aria-[invalid=true]:border-signal aria-[invalid=true]:border-2"
          />
          <button type="submit" className="btn btn-primary" aria-disabled={phase.kind === "submitting"}>
            {phase.kind === "submitting" ? "Posting" : "Post score"}
          </button>
        </div>
        {error ? (
          <p id={errorId} className="text-small font-medium text-signal">
            <span aria-hidden="true">Error: </span>
            {error}
          </p>
        ) : null}
        {phase.kind === "error" ? (
          <p role="alert" className="text-small">
            {phase.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
