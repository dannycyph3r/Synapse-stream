"use client";

import Link from "next/link";
import { forwardRef } from "react";
import { ArrowRight } from "lucide-react";
import type { RunConfig } from "@/lib/game/engine";
import { difficultyFor } from "@/lib/game/rules";
import { formatDuration } from "@/lib/game/scoring";
import { modeTitle } from "./SessionResults";

function Rules({ durationMs, spoken }: { durationMs: number; spoken: boolean }) {
  const rules = [
    {
      title: spoken ? "Listen." : "Watch.",
      body: spoken
        ? `Token names are spoken one at a time, ${formatDuration(durationMs)} apart. The symbols are shown too.`
        : `Symbols appear one at a time, ${formatDuration(durationMs)} each, then the stream dissolves.`,
    },
    { title: "Rebuild.", body: "Enter the same symbols in the same order. Repeats count as separate positions." },
    {
      title: "Continue.",
      body: "Each correct answer banks its presentation time into your Focus Endurance Index, and the next stream grows longer or faster.",
    },
    {
      title: "One miss ends the run.",
      body: "Recall has no time limit and waiting adds nothing. Press Escape or Pause at any time; the sequence is hidden while paused.",
    },
  ];
  return (
    <ol className="grid gap-px bg-rule sm:grid-cols-2">
      {rules.map((r, i) => (
        <li key={r.title} className="grid grid-cols-[2.5rem_1fr] gap-x-2 bg-canvas py-4 pr-4">
          <span className="num pt-0.5 text-small text-ink-2" aria-hidden="true">
            {String(i + 1).padStart(2, "0")}
          </span>
          <p>
            <strong className="font-semibold">{r.title}</strong> <span className="text-ink-2">{r.body}</span>
          </p>
        </li>
      ))}
    </ol>
  );
}

export const PrepareScreen = forwardRef<
  HTMLHeadingElement,
  {
    config: RunConfig;
    rulesSeen: boolean;
    spokenUnavailable: boolean;
    onBegin: () => void;
  }
>(function PrepareScreen({ config, rulesSeen, spokenUnavailable, onBegin }, headingRef) {
  const first = difficultyFor(config.rules, config.offset);
  const spoken = config.rules.division === "spoken";
  const daily = config.mode.kind === "daily";

  return (
    <div className="pt-10 sm:pt-14">
      <p className="label">{modeTitle(config.mode)}</p>
      <h1 ref={headingRef} tabIndex={-1} className="mt-3 text-display font-semibold outline-none">
        {daily ? "Today’s stream." : "Hold the pattern."}
      </h1>

      <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-3 border-y border-ink py-4">
        {[
          ["Starts at", `${first.length} tokens`],
          ["Each token", formatDuration(first.durationMs)],
          ["Fastest", formatDuration(config.rules.minDurationMs)],
          ["Longest", `${config.rules.maxLength} tokens`],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="label">{k}</dt>
            <dd className="num mt-1 text-[1.25rem]">{v}</dd>
          </div>
        ))}
      </dl>

      {spokenUnavailable ? (
        <p role="note" className="mt-6 max-w-[42rem] border-l-2 border-ink pl-4">
          Spoken presentation is selected, but this browser cannot speak. This run uses the visual division instead.
          <Link href="/settings" className="link ml-1">
            Change in settings
          </Link>
        </p>
      ) : null}

      <div className="mt-8">
        {rulesSeen ? (
          <details>
            <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium">How a run works</summary>
            <div className="mt-2">
              <Rules durationMs={first.durationMs} spoken={spoken} />
            </div>
          </details>
        ) : (
          <>
            <h2 className="label mb-2">How a run works</h2>
            <Rules durationMs={first.durationMs} spoken={spoken} />
          </>
        )}
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary min-w-48" onClick={onBegin}>
          {daily ? "Begin ranked run" : "Begin session"}
          <ArrowRight aria-hidden="true" className="size-4" />
        </button>
        <Link href="/settings" className="btn btn-quiet">
          Settings
        </Link>
      </div>
      <p className="mt-3 max-w-[42rem] text-small text-ink-2">
        {daily
          ? "One ranked attempt per day. It counts from the moment the first sequence appears, so leaving after that ends the run."
          : "Practice is unranked and stays on this device. Restart as often as you like."}
      </p>
    </div>
  );
});
