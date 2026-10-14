"use client";

import Link from "next/link";
import { forwardRef, useState } from "react";
import { RotateCcw, Share2 } from "lucide-react";
import { TokenGlyph } from "@/components/TokenGlyph";
import { announce } from "@/components/Announcer";
import type { RunMode } from "@/lib/game/engine";
import { practiceLevel } from "@/lib/game/rules";
import { describeFei, formatDelta, formatFei } from "@/lib/game/scoring";
import { reviewPositions } from "@/lib/game/sequence";
import { tokenLabel, type TokenId } from "@/lib/game/tokens";
import type { RunSummary } from "@/lib/storage/schema";
import { PostScore } from "./PostScore";

export interface RunResult {
  summary: RunSummary;
  previousBestMs: number | null;
  isPersonalBest: boolean;
  /** Practice only: the sequence that ended the run and the answer given. */
  review: { sequence: readonly TokenId[]; answer: readonly TokenId[] } | null;
}

export function modeTitle(mode: RunMode): string {
  const division = mode.division === "spoken" ? "Spoken" : "Visual";
  if (mode.kind === "daily") return `Daily challenge · ${mode.dateKey} UTC · ${division}`;
  const seed = mode.customSeed ? ` · Seed ${mode.customSeed}` : "";
  return `Practice · ${practiceLevel(mode.level).label} · ${division}${seed}`;
}

const REASON: Record<RunSummary["endReason"], string> = {
  mismatch: "The last sequence did not match. Every run ends this way eventually; the score is what you held before it.",
  exited: "You ended the run. Everything completed before that is banked.",
  interrupted: "This run was interrupted by a reload or a closed tab. Challenges completed before that are banked.",
};

export function shareText(s: RunSummary): string {
  const bar = "■".repeat(Math.min(s.completed, 24)) + (s.endReason === "mismatch" ? "□" : "");
  const head =
    s.mode.kind === "daily"
      ? `Synapse Stream · Daily ${s.mode.dateKey} · ${s.mode.division === "spoken" ? "Spoken" : "Visual"}`
      : `Synapse Stream · Practice · ${practiceLevel(s.mode.level).label}`;
  return `${head}\nFEI ${formatFei(s.feiMs)} · ${s.completed} challenge${s.completed === 1 ? "" : "s"} · longest ${s.maxLength}\n${bar}`;
}

export const SessionResults = forwardRef<HTMLHeadingElement, { result: RunResult; onRestart: (() => void) | null }>(
  function SessionResults({ result, onRestart }, headingRef) {
    const { summary: s, previousBestMs, isPersonalBest, review } = result;
    const [shareState, setShareState] = useState<"idle" | "copied" | "manual">("idle");
    const text = shareText(s);

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
    const stats = [
      { label: "Challenges completed", value: String(s.completed) },
      { label: "Longest sequence held", value: s.maxLength ? `${s.maxLength} tokens` : "None yet" },
      { label: "Highest streak", value: String(s.bestStreak) },
    ];

    return (
      <div className="pt-10 sm:pt-14">
        <p className="label">{modeTitle(s.mode)}</p>
        <h1 ref={headingRef} tabIndex={-1} className="mt-3 text-title font-semibold outline-none">
          Run complete
        </h1>
        <p className="mt-2 max-w-[40rem] text-lead text-ink-2">{REASON[s.endReason]}</p>

        <section aria-labelledby="fei-heading" className="mt-10 grid gap-8 border-t border-ink pt-6 md:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 id="fei-heading" className="label">
              Focus Endurance Index
            </h2>
            <p className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-2">
              <span className="num text-[clamp(3.5rem,11vw,6.5rem)] font-medium leading-[0.9] tracking-[-0.04em]">
                <span aria-hidden="true">{formatFei(s.feiMs)}</span>
                <span className="sr-only">{describeFei(s.feiMs)}</span>
              </span>
              {isPersonalBest ? (
                <span className="label border border-signal px-2 py-1 !text-signal">Personal best</span>
              ) : null}
            </p>
            <p className="mt-4 text-ink-2">
              {previousBestMs === null ? (
                "First recorded run in this category."
              ) : (
                <>
                  Previous best <span className="num text-ink">{formatFei(previousBestMs)}</span>
                  <span className="num">
                    {" "}
                    ({delta !== null && delta !== 0 ? formatDelta(delta) : "matched"})
                  </span>
                </>
              )}
            </p>
          </div>
          <dl className="grid content-start">
            {stats.map((st) => (
              <div key={st.label} className="flex items-baseline justify-between gap-4 border-b border-rule py-3 first:pt-0">
                <dt className="text-ink-2">{st.label}</dt>
                <dd className="num text-[1.25rem]">{st.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="mt-10 flex flex-wrap gap-2">
          {onRestart ? (
            <button type="button" className="btn btn-primary" onClick={onRestart}>
              <RotateCcw aria-hidden="true" className="size-4" />
              Play again
            </button>
          ) : (
            <Link href="/play?mode=practice" className="btn btn-primary">
              Practice now
            </Link>
          )}
          <Link href="/" className="btn btn-secondary">
            Dashboard
          </Link>
          <button type="button" className="btn btn-secondary" onClick={share}>
            <Share2 aria-hidden="true" className="size-4" />
            Share summary
          </button>
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
          <div className="mt-12">
            <PostScore dateKey={s.mode.dateKey} division={s.mode.division} />
          </div>
        ) : null}

        {review ? <Review review={review} /> : null}
      </div>
    );
  },
);

function Review({ review }: { review: NonNullable<RunResult["review"]> }) {
  const rows = reviewPositions(review.sequence, review.answer);
  const misses = rows.filter((r) => !r.correct).map((r) => r.position);
  return (
    <details className="rule-top mt-12 pt-5">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium">
        Review the final sequence
      </summary>
      <p className="mt-2 text-small text-ink-2">
        Practice only. Daily sequences are never revealed, since everyone plays the same ones.
      </p>
      <table className="mt-4 w-full max-w-xl border-collapse text-left">
        <caption className="sr-only">
          Final sequence compared with your answer. Mismatch at position{misses.length > 1 ? "s" : ""}{" "}
          {misses.join(", ")}.
        </caption>
        <thead>
          <tr className="border-b border-ink">
            <th scope="col" className="label py-2 pr-3 font-normal">Pos</th>
            <th scope="col" className="label py-2 pr-3 font-normal">Sequence</th>
            <th scope="col" className="label py-2 pr-3 font-normal">Your answer</th>
            <th scope="col" className="label py-2 font-normal">Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.position} className="border-b border-rule">
              <td className="num py-2 pr-3">{String(r.position).padStart(2, "0")}</td>
              <td className="py-2 pr-3">
                <span className="inline-flex items-center gap-2">
                  <TokenGlyph token={r.expected} className="size-5" />
                  {tokenLabel(r.expected)}
                </span>
              </td>
              <td className="py-2 pr-3">
                {r.given ? (
                  <span className="inline-flex items-center gap-2">
                    <TokenGlyph token={r.given} className="size-5" />
                    {tokenLabel(r.given)}
                  </span>
                ) : (
                  "None"
                )}
              </td>
              <td className={`py-2 ${r.correct ? "text-ink-2" : "font-semibold"}`}>{r.correct ? "Match" : "Mismatch"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
