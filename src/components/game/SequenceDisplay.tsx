"use client";

import { forwardRef } from "react";
import { Check } from "lucide-react";
import { TokenGlyph } from "@/components/TokenGlyph";
import { observePosition, visibleToken, type GameState } from "@/lib/game/engine";
import { difficultyFor } from "@/lib/game/rules";
import { formatDelta, formatDuration } from "@/lib/game/scoring";
import { tokenLabel } from "@/lib/game/tokens";

/**
 * The stage. It renders only the token currently on screen and nothing once
 * the observe phase ends, so the sequence is never sitting in the document
 * waiting to be read. Glyphs are aria-hidden: in the visual division the
 * sequence is deliberately not exposed as text. The spoken division carries
 * it through speech instead.
 */
export const SequenceDisplay = forwardRef<HTMLDivElement, { state: GameState; spoken: boolean }>(
  function SequenceDisplay({ state, spoken }, ref) {
    const c = state.challenge;
    const token = visibleToken(state);
    const next =
      state.status === "feedback" && state.config
        ? difficultyFor(state.config.rules, state.config.offset + state.completed)
        : null;
    const isDissolve = state.status === "observing" && !!c && state.observeStep === c.length * 2 - 1;

    let body: React.ReactNode = null;
    let caption: string;

    switch (state.status) {
      case "countdown":
        caption = "Starting";
        body = (
          <span key={state.countdown} className="num fade-in text-[clamp(4rem,14dvh,7rem)] font-medium leading-none">
            {state.countdown}
          </span>
        );
        break;
      case "observing":
        caption = spoken ? "Listen" : "Observe";
        body = token ? <TokenGlyph key={state.observeStep} token={token} className="stage-glyph" /> : null;
        break;
      case "recalling":
        caption = "Recall";
        body = (
          <div className="fade-in grid place-items-center gap-2 text-center">
            <span className="num text-[clamp(2.5rem,9dvh,4rem)] leading-none">
              {state.answer.length}
              <span className="text-on-inverse-2">/{c?.length ?? 0}</span>
            </span>
            <span className="text-small text-on-inverse-2">Rebuild the sequence in order</span>
          </div>
        );
        break;
      case "feedback":
        caption = "Held";
        body = (
          <div className="fade-in grid place-items-center gap-3 text-center">
            <Check aria-hidden="true" className="size-14" strokeWidth={1.75} />
            <span className="num text-[1.75rem] leading-none">{formatDelta(state.lastContributionMs)}</span>
            {next ? (
              <span className="num mt-2 text-small text-on-inverse-2">
                Next · {next.length} tokens · {formatDuration(next.durationMs)}
              </span>
            ) : null}
          </div>
        );
        break;
      case "paused":
        caption = "Paused";
        body = <span className="text-lead text-on-inverse-2">Sequence hidden</span>;
        break;
      default:
        caption = "";
    }

    return (
      <div
        ref={ref}
        tabIndex={-1}
        role="group"
        aria-label={`Stage. ${caption}${c ? `, challenge ${c.index + 1}` : ""}`}
        className="stage on-inverse"
      >
        <span className="label absolute left-3 top-3 !text-on-inverse-2" aria-hidden="true">
          {caption}
        </span>
        {state.status === "observing" && c ? (
          <span className="label num absolute right-3 top-3 !text-on-inverse-2" aria-hidden="true">
            {String(Math.min(observePosition(state), c.length)).padStart(2, "0")} / {String(c.length).padStart(2, "0")}
          </span>
        ) : null}
        {body}
        {isDissolve ? <div className="dissolve" aria-hidden="true" /> : null}
      </div>
    );
  },
);

/**
 * One cell per position. While observing, cells fill as tokens pass, which is
 * what makes a repeated token legible as two. While recalling, they hold the
 * answer so far.
 */
export function SequenceSlots({ state }: { state: GameState }) {
  const c = state.challenge;
  if (!c) return <div className="h-10" aria-hidden="true" />;
  const recalling = state.status === "recalling";
  const pos = observePosition(state);
  const cells = Array.from({ length: c.length }, (_, i) => {
    if (recalling || state.status === "feedback" || (state.status === "paused" && state.pausedFrom === "recalling")) {
      const t = state.answer[i];
      const isNext = recalling && i === state.answer.length;
      return { state: t ? "filled" : isNext ? "current" : "empty", token: t ?? null };
    }
    if (state.status === "observing" || state.status === "paused") {
      if (i < pos - 1) return { state: "seen", token: null };
      if (i === pos - 1 && state.observeStep % 2 === 0) return { state: "current", token: null };
      if (i === pos - 1) return { state: "seen", token: null };
    }
    return { state: "empty", token: null };
  });

  const filled = state.answer.length;
  return (
    <ol
      aria-label={recalling ? `Your answer, ${filled} of ${c.length} placed` : `Sequence of ${c.length} positions`}
      className="grid w-full max-w-[26rem] justify-center gap-1"
      style={{ gridTemplateColumns: `repeat(${c.length}, minmax(0, 2.25rem))` }}
    >
      {cells.map((cell, i) => (
        <li key={i} className="slot" data-state={cell.state}>
          {cell.token ? (
            <>
              <TokenGlyph token={cell.token} className="size-[62%]" />
              <span className="sr-only">
                Position {i + 1}: {tokenLabel(cell.token)}
              </span>
            </>
          ) : (
            <span className="sr-only">
              Position {i + 1}: {recalling ? "empty" : cell.state === "seen" ? "shown" : "waiting"}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
