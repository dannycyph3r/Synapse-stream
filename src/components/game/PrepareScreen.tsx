"use client";

import Link from "next/link";
import { forwardRef } from "react";
import { ArrowRight } from "lucide-react";
import type { RunConfig } from "@/lib/game/engine";

/**
 * The start screen. Shown for every daily run (a one-shot ranked attempt) and
 * for a player's first practice run. Returning practice players skip it.
 * Full rules live in Help; this keeps only what is needed to begin.
 */
export const PrepareScreen = forwardRef<
  HTMLHeadingElement,
  { config: RunConfig; spokenUnavailable: boolean; onBegin: () => void }
>(function PrepareScreen({ config, spokenUnavailable, onBegin }, headingRef) {
  const daily = config.mode.kind === "daily";
  const spoken = config.rules.division === "spoken";
  const steps = [
    spoken ? "Listen as the symbols are named, one at a time." : "Watch the symbols appear, one at a time.",
    "Rebuild them in the same order.",
    "One miss ends the run.",
  ];

  return (
    <div className="pt-8 sm:pt-12">
      <p className="label">{daily ? `Daily · ${config.mode.kind === "daily" ? config.mode.dateKey : ""} UTC` : "Practice"}</p>
      <h1 ref={headingRef} tabIndex={-1} className="mt-2 text-headline font-semibold outline-none">
        {daily ? "Daily challenge" : "Hold the pattern."}
      </h1>

      {daily ? (
        <p className="mt-3 max-w-[34rem] text-ink-2">
          One ranked attempt today. Everyone gets the same sequences until 00:00 UTC.
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

      <div className="mt-8 grid max-w-[22rem] gap-3">
        <button type="button" className="btn btn-primary min-h-14 text-[1.0625rem]" onClick={onBegin}>
          {daily ? "Begin ranked run" : "Begin"}
          <ArrowRight aria-hidden="true" className="size-5" />
        </button>
        <Link href={daily ? "/help#modes" : "/help"} className="link inline-flex min-h-11 items-center self-start text-small text-ink-2">
          {daily ? "How the daily challenge works" : "Full rules in Help"}
        </Link>
      </div>
    </div>
  );
});
