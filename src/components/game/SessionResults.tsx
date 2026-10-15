"use client";

import Link from "next/link";
import { forwardRef, useState } from "react";
import { RotateCcw, Share2 } from "lucide-react";
import { announce } from "@/components/Announcer";
import type { FailureRecord, RunMode } from "@/lib/game/engine";
import { mismatchDetails, mismatchSentence } from "@/lib/game/feedback";
import { practiceLevel } from "@/lib/game/rules";
import { describeFei, formatDelta, formatFei } from "@/lib/game/scoring";
import type { Quote } from "@/lib/quotes";
import type { RunSummary } from "@/lib/storage/schema";
import { PatternComparison } from "./PatternComparison";
import { PostScore } from "./PostScore";

export interface RunResult {
  summary: RunSummary;
  previousBestMs: number | null;
  isPersonalBest: boolean;
  /** The challenge that ended the run, straight from engine state. Null for exits and interrupted runs. */
  failure: FailureRecord | null;
  /** The line shown after a failed round. */
  quote: Quote | null;
}

export function modeTitle(mode: RunMode): string {
  const division = mode.division === "spoken" ? "Spoken" : "Visual";
  if (mode.kind === "daily") return `Daily · ${mode.dateKey} UTC · ${division}`;
  const seed = mode.customSeed ? ` · Seed ${mode.customSeed}` : "";
  return `Practice · ${practiceLevel(mode.level).label} · ${division}${seed}`;
}

export function shareText(s: RunSummary): string {
  const bar = "■".repeat(Math.min(s.completed, 24)) + (s.endReason === "mismatch" ? "□" : "");
  const head =
    s.mode.kind === "daily"
      ? `SYNAPSE · Daily ${s.mode.dateKey} · ${s.mode.division === "spoken" ? "Spoken" : "Visual"}`
      : `SYNAPSE · Practice · ${practiceLevel(s.mode.level).label}`;
  return `${head}\nFEI ${formatFei(s.feiMs)} · ${s.completed} held · longest ${s.maxLength}\n${bar}`;
}

function headline(result: RunResult): { title: string; sub: string | null } {
  if (result.failure) return { title: mismatchSentence(result.failure.mismatches), sub: null };
  if (result.summary.endReason === "interrupted") {
    return { title: "Run recorded", sub: "The run was interrupted by a reload or a closed tab. Everything held before that is banked." };
  }
  return { title: "Run ended", sub: "Everything held before you left is banked." };
}

export const SessionResults = forwardRef<HTMLHeadingElement, { result: RunResult; onRestart: (() => void) | null }>(
  function SessionResults({ result, onRestart }, headingRef) {
    const { summary: s, previousBestMs, isPersonalBest, failure, quote } = result;
    const [shareState, setShareState] = useState<"idle" | "copied" | "manual">("idle");
    const text = shareText(s);
    const { title, sub } = headline(result);

    async function share() {
      try {
        if (typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches) {
          await navigator.share({ text });
          return;
        }
        await navigator.clipboard.writeText(text);
        setShareState("copied");
        announce("Summary copied to the clipboard.");
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") return;
        setShareState("manual");
      }
    }

    const delta = previousBestMs === null ? null : s.feiMs - previousBestMs;

    return (
      <div className="pt-6 sm:pt-10">
        <p className="label">{modeTitle(s.mode)}</p>
        <h1 ref={headingRef} tabIndex={-1} className="mt-2 max-w-[22ch] text-headline font-semibold outline-none">
          {title}
        </h1>
        {sub ? <p className="mt-2 max-w-[38rem] text-ink-2">{sub}</p> : null}

        <div className="mt-6 grid gap-8 md:mt-8 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:gap-12">
          {failure ? (
            <section aria-labelledby="compare-h" className="min-w-0">
              <h2 id="compare-h" className="sr-only">
                Your pattern and the correct pattern
              </h2>
              <PatternComparison failure={failure} />
              <ul className="mt-3 grid gap-0.5 text-small text-ink-2">
                {mismatchDetails(failure).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="fei-h" className={`min-w-0 ${failure ? "" : "md:col-span-2"}`}>
            <h2 id="fei-h" className="label">
              Focus Endurance Index
            </h2>
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="num text-[clamp(2.75rem,10vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em]">
                <span aria-hidden="true">{formatFei(s.feiMs)}</span>
                <span className="sr-only">{describeFei(s.feiMs)}</span>
              </span>
              {isPersonalBest ? (
                <span className="label border border-signal px-2 py-1 !text-signal">Personal best</span>
              ) : null}
            </p>
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-small">
              <div className="flex gap-1.5">
                <dt className="text-ink-2">Held</dt>
                <dd className="num">{s.completed}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-ink-2">Longest</dt>
                <dd className="num">{s.maxLength || "–"}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-ink-2">Previous best</dt>
                <dd className="num">
                  {previousBestMs === null
                    ? "none"
                    : `${formatFei(previousBestMs)} (${delta !== null && delta !== 0 ? formatDelta(delta) : "matched"})`}
                </dd>
              </div>
            </dl>
            {quote ? (
              <blockquote className="quote mt-6" data-testid="failure-quote">
                <p>{quote.text}</p>
              </blockquote>
            ) : null}
          </section>
        </div>

        <div className="mt-8 grid gap-2 sm:flex sm:flex-wrap">
          {onRestart ? (
            <button type="button" className="btn btn-primary sm:min-w-44" onClick={onRestart}>
              <RotateCcw aria-hidden="true" className="size-4" />
              Play again
            </button>
          ) : (
            <Link href="/play?mode=practice" className="btn btn-primary sm:min-w-44">
              Practice
            </Link>
          )}
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Link href="/" className="btn btn-secondary">
              Home
            </Link>
            <button type="button" className="btn btn-secondary" onClick={share}>
              <Share2 aria-hidden="true" className="size-4" />
              Share
            </button>
          </div>
        </div>
        {shareState === "copied" ? <p className="mt-2 text-small text-ink-2">Copied. It contains no answers.</p> : null}
        {shareState === "manual" ? (
          <div className="mt-3 max-w-md">
            <label htmlFor="share-text" className="text-small text-ink-2">
              Copying is blocked here. Select and copy this summary:
            </label>
            <textarea
              id="share-text"
              readOnly
              value={text}
              rows={3}
              className="num mt-1 w-full border border-line bg-surface p-2 text-small"
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>
        ) : null}

        {s.mode.kind === "daily" ? (
          <div className="mt-10">
            <PostScore dateKey={s.mode.dateKey} division={s.mode.division} />
          </div>
        ) : null}
      </div>
    );
  },
);
