"use client";

import Link from "next/link";
import { forwardRef, useId, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { MAX_DAILY_ATTEMPTS } from "@/lib/game/daily";
import type { RunConfig } from "@/lib/game/engine";
import { describeFei, formatFei } from "@/lib/game/scoring";
import { DISPLAY_NAME_PATTERN } from "@/lib/storage/schema";
import { ModeTag } from "./ModeTag";

export function nameProblem(name: string): string | null {
  const v = name.trim();
  if (v.length === 0) return "Enter a name for the leaderboard.";
  if (v.length < 2 || v.length > 20) return "Use between 2 and 20 characters.";
  if (!DISPLAY_NAME_PATTERN.test(v)) return "Use only letters, numbers, spaces, dots, dashes or underscores.";
  return null;
}

export function normaliseName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/**
 * The start screen. Shown for every daily attempt and for a player's first
 * practice run; returning practice players skip it. A daily attempt asks for
 * the leaderboard name first, so the score can post automatically.
 */
export const PrepareScreen = forwardRef<
  HTMLHeadingElement,
  {
    config: RunConfig;
    spokenUnavailable: boolean;
    initialName: string;
    /** Today's best so far, before a second attempt. */
    previousBestMs: number | null;
    onBegin: (name: string | null) => void;
  }
>(function PrepareScreen({ config, spokenUnavailable, initialName, previousBestMs, onBegin }, headingRef) {
  const daily = config.mode.kind === "daily";
  const attempt = config.mode.kind === "daily" ? config.mode.attempt : 1;
  const spoken = config.rules.division === "spoken";
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const steps = [
    spoken ? "Listen as the symbols are named, one at a time." : "Watch the symbols appear, one at a time.",
    "Rebuild them in the same order.",
    "One miss ends the run.",
  ];

  function begin(e?: React.FormEvent) {
    e?.preventDefault();
    if (!daily) {
      onBegin(null);
      return;
    }
    const problem = nameProblem(name);
    setError(problem);
    if (problem) {
      nameRef.current?.focus();
      return;
    }
    onBegin(normaliseName(name));
  }

  return (
    <div className="pt-8 sm:pt-12">
      <ModeTag mode={config.mode} />
      <h1 ref={headingRef} tabIndex={-1} className="mt-2 text-headline font-semibold outline-none">
        {daily ? (attempt > 1 ? "Second attempt" : "Daily challenge") : "Hold the pattern."}
      </h1>

      {daily ? (
        <p className="mt-3 max-w-[34rem] text-ink-2">
          {attempt > 1 ? (
            <>
              New sequences, same for everyone. Your better attempt counts
              {previousBestMs !== null ? (
                <>
                  ; to beat:{" "}
                  <span className="num text-ink">
                    <span aria-hidden="true">{formatFei(previousBestMs)}</span>
                    <span className="sr-only">{describeFei(previousBestMs)}</span>
                  </span>
                </>
              ) : null}
              .
            </>
          ) : (
            <>
              {MAX_DAILY_ATTEMPTS} ranked attempts today, the same sequences for everyone until 00:00 UTC. Your best run is
              posted to the global leaderboard automatically.
            </>
          )}
        </p>
      ) : (
        <ol className="mt-5 grid max-w-[30rem] border-t border-ink">
          {steps.map((step, i) => (
            <li key={step} className="grid grid-cols-[2rem_1fr] border-b border-rule py-2.5">
              <span className="num text-small text-ink-2" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      )}

      {spokenUnavailable ? (
        <p role="note" className="mt-5 max-w-[34rem] border-l-2 border-ink pl-4 text-small">
          This browser cannot speak, so this run uses visual presentation.{" "}
          <Link href="/settings" className="link">
            Settings
          </Link>
        </p>
      ) : null}

      <form onSubmit={begin} noValidate className="mt-8 grid max-w-[22rem] gap-3">
        {daily ? (
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-name`} className="font-medium">
              Your name on the leaderboard
            </label>
            <input
              ref={nameRef}
              id={`${id}-name`}
              name="displayName"
              autoComplete="nickname"
              spellCheck={false}
              maxLength={20}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
              className="min-h-12 border border-line bg-surface px-3 text-ink aria-[invalid=true]:border-2 aria-[invalid=true]:border-signal"
            />
            <p id={`${id}-hint`} className="text-small text-ink-2">
              Shown publicly. 2 to 20 letters, numbers, spaces, dots, dashes or underscores.
            </p>
            {error ? (
              <p id={`${id}-error`} className="text-small font-medium text-signal">
                <span aria-hidden="true">Error: </span>
                {error}
              </p>
            ) : null}
          </div>
        ) : null}
        <button type="submit" className="btn btn-primary mt-1 min-h-14 text-[1.0625rem]">
          {daily ? `Play attempt ${attempt} of ${MAX_DAILY_ATTEMPTS}` : "Play"}
          <ArrowRight aria-hidden="true" className="size-5" />
        </button>
        <Link href={daily ? "/help#modes" : "/help"} className="link inline-flex min-h-11 items-center self-start text-small text-ink-2">
          {daily ? "How the daily challenge works" : "Full rules in Help"}
        </Link>
      </form>
    </div>
  );
});
