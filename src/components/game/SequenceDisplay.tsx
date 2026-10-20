"use client";

import { forwardRef } from "react";
import { Check } from "lucide-react";
import { TokenGlyph } from "@/components/TokenGlyph";
import { observePosition, visibleToken, type GameState } from "@/lib/game/engine";
import { formatDelta } from "@/lib/game/scoring";
import { tokenLabel } from "@/lib/game/tokens";

/**
 * The stage. It renders only the token currently on screen and nothing once
 * the observe phase ends, so the sequence is never sitting in the document
 * waiting to be read. Glyphs are aria-hidden: in the visual division the
 * sequence is deliberately not exposed as text. The spoken division carries
 * it through speech instead.
 */
export const SequenceDisplay = forwardRef<
  HTMLDivElement,
  { state: GameState; spoken: boolean; quote?: string | null }
>(function SequenceDisplay({ state, spoken, quote = null }, ref) {
    const c = state.challenge;
    const token = visibleToken(state);
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
            <span className="num text-[clamp(2.25rem,8svh,4rem)] leading-none">
              {state.answer.length}
              <span className="text-on-inverse-2">/{c?.length ?? 0}</span>
            </span>
            <span className="text-small text-on-inverse-2">In order</span>
          </div>
        );
        break;
      case "feedback":
        caption = "Held";
        body = (
          <div className="fade-in grid w-full place-items-center gap-[clamp(0.25rem,1.5svh,0.75rem)] px-4 text-center">
            <Check aria-hidden="true" className="size-[clamp(1.5rem,7svh,3.25rem)]" strokeWidth={1.75} />
            <span className="num text-[clamp(1.25rem,4svh,1.75rem)] leading-none">{formatDelta(state.lastContributionMs)}</span>
            {quote ? (
              <p data-testid="round-quote" className="stage-quote line-clamp-3 max-w-[17rem]">
                &ldquo;{quote}&rdquo;
              </p>
            ) : null}
          </div>
        );
        break;
      case "ended":
        // A short beat after a miss: the mark cracks apart before the results.
        caption = state.endReason === "mismatch" ? "Broken" : "Ended";
        body =
          state.endReason === "mismatch" ? (
            <svg viewBox="0 0 100 100" className="break-mark" aria-hidden="true">
              <g stroke="currentColor" strokeWidth="7" strokeLinecap="square">
                <line className="break-a" x1="22" y1="22" x2="47" y2="47" />
                <line className="break-b" x1="53" y1="53" x2="78" y2="78" />
                <line className="break-c" x1="78" y1="22" x2="53" y2="47" />
                <line className="break-d" x1="47" y1="53" x2="22" y2="78" />
              </g>
            </svg>
          ) : null;
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
});

/**
 * One cell per position. While observing, cells fill as tokens pass, which is
 * what makes a repeated token legible as two. While recalling, they hold the
 * answer so far.
 */
export function SequenceSlots({ state }: { state: GameState }) {
  const c = state.challenge;
  // A fixed-height row, so nothing below it moves as sequences change length.
  if (!c) return <div className="game-slots h-9" aria-hidden="true" />;
  const recalling = state.status === "recalling";
  const pos = observePosition(state);
  const cells = Array.from({ length: c.length }, (_, i) => {
    if (state.status === "ended" && state.failure) {
      const t = state.answer[i] ?? null;
      return { state: state.failure.mismatches.includes(i + 1) ? "miss" : "filled", token: t };
    }
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
      className="game-slots grid h-9 w-full max-w-[26rem] content-center justify-center gap-1"
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
