"use client";

import { forwardRef } from "react";
import { Delete, RotateCcw, CornerDownLeft } from "lucide-react";
import { TokenGlyph } from "@/components/TokenGlyph";
import { TOKENS, type TokenId } from "@/lib/game/tokens";

interface Props {
  active: boolean;
  filled: number;
  length: number;
  onSelect: (token: TokenId) => void;
  onUndo: () => void;
  onClear: () => void;
  onSubmit: () => void;
}

/**
 * The keypad. It stays on screen for the whole run so the layout never jumps,
 * but it is inert outside recall: not focusable, not announced, not pressable.
 */
export const TokenInput = forwardRef<HTMLButtonElement, Props>(function TokenInput(
  { active, filled, length, onSelect, onUndo, onClear, onSubmit },
  firstKeyRef,
) {
  const complete = length > 0 && filled === length;
  return (
    <div inert={!active} className={`game-keypad w-full max-w-[26rem] transition-opacity ${active ? "" : "opacity-35"}`}>
      <div role="group" aria-label="Tokens" className="grid grid-cols-4 gap-1.5 sm:gap-2">
        {TOKENS.map((t, i) => (
          <button
            key={t.id}
            ref={i === 0 ? firstKeyRef : undefined}
            type="button"
            className="token-key"
            aria-keyshortcuts={t.key}
            onClick={() => onSelect(t.id)}
          >
            <span className="token-key-key" aria-hidden="true">
              {t.key}
            </span>
            <TokenGlyph token={t.id} className="size-7 sm:size-8" />
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-[1fr_1fr_1.35fr] gap-1.5 sm:mt-2 sm:gap-2">
        <button
          type="button"
          className="btn btn-secondary min-w-0 px-2"
          onClick={onUndo}
          aria-keyshortcuts="Backspace"
          aria-disabled={filled === 0}
        >
          <RotateCcw aria-hidden="true" className="size-4 shrink-0 max-[359px]:hidden" />
          Undo
        </button>
        <button
          type="button"
          className="btn btn-secondary min-w-0 px-2"
          onClick={onClear}
          aria-keyshortcuts="Delete"
          aria-disabled={filled === 0}
        >
          <Delete aria-hidden="true" className="size-4 shrink-0 max-[359px]:hidden" />
          Clear
        </button>
        <button
          type="button"
          className="btn btn-primary min-w-0 px-2"
          onClick={onSubmit}
          aria-keyshortcuts="Enter"
          aria-disabled={!complete}
          aria-describedby="submit-hint"
        >
          Submit
          <CornerDownLeft aria-hidden="true" className="size-4 shrink-0" />
        </button>
      </div>
      {/* The stage counter and the cells already show progress; this is for assistive technology. */}
      <p id="submit-hint" className="sr-only">
        {active ? (complete ? "Ready to submit." : `${length - filled} of ${length} positions left.`) : ""}
      </p>
    </div>
  );
});
