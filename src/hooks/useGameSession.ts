"use client";

/**
 * Connects the pure engine to the browser: timers, tab visibility, speech,
 * sound and screen-reader announcements. All game rules stay in the engine.
 */
import { useCallback, useEffect, useReducer, useRef } from "react";
import { announce } from "@/components/Announcer";
import {
  gameReducer,
  initialGameState,
  phaseDelay,
  visibleToken,
  type GameState,
  type RunConfig,
} from "@/lib/game/engine";
import { difficultyFor } from "@/lib/game/rules";
import { describeFei, formatDuration } from "@/lib/game/scoring";
import { mismatchSentence } from "@/lib/game/feedback";
import { tokenLabel, type TokenId } from "@/lib/game/tokens";
import { cancelSpeech, playCue, speak } from "@/lib/media";

interface Options {
  spoken: boolean;
  sound: boolean;
  /** Skip the start screen and go straight to the countdown. */
  autostart?: boolean;
  /** The line shown after the n-th held challenge of this run (1-based). */
  successLine?: (completed: number) => string | null;
}


function challengeIntro(n: number, length: number, durationMs: number): string {
  return `Challenge ${n}. ${length} tokens, ${formatDuration(durationMs).replace(" s", " seconds")} each.`;
}

export function useGameSession(initialConfig: RunConfig, { spoken, sound, autostart = false, successLine }: Options) {
  const [state, dispatch] = useReducer(gameReducer, initialConfig, (config) =>
    gameReducer(initialGameState, { type: "start", config, skipPrepare: autostart }),
  );

  // Timers: one per phase. The tick carries the epoch it was scheduled for,
  // so even a timer that escaped cleanup cannot advance a later state.
  const delay = phaseDelay(state);
  const epoch = state.epoch;
  useEffect(() => {
    if (delay === null) return;
    const id = window.setTimeout(() => dispatch({ type: "tick", epoch }), delay);
    return () => window.clearTimeout(id);
  }, [delay, epoch]);

  // Leaving the tab pauses any timed phase, so nothing is shown unseen.
  const status = state.status;
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") dispatch({ type: "pause" });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Speech must never outlive the phase that started it.
  useEffect(() => {
    if (status !== "observing") cancelSpeech();
  }, [status]);
  useEffect(() => () => cancelSpeech(), []);

  // Transition side effects, keyed on the epoch.
  const prev = useRef<GameState | null>(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = state;
    if (!before) {
      // A run that opens straight into its countdown still announces itself.
      if (state.status === "countdown" && state.config) {
        const d = difficultyFor(state.config.rules, state.config.offset);
        announce(`Get ready. ${challengeIntro(1, d.length, d.durationMs)}`);
      }
      return;
    }
    if (before.epoch === state.epoch) return;
    const c = state.challenge;

    if (state.status === "countdown" && before.status !== "countdown" && state.config) {
      const d = difficultyFor(state.config.rules, state.config.offset);
      announce(`Get ready. ${challengeIntro(1, d.length, d.durationMs)}`);
    }

    if (state.status === "observing") {
      const token = visibleToken(state);
      if (token && c) {
        if (spoken) speak(tokenLabel(token), c.durationMs);
        if (sound) playCue("token");
      }
    }

    if (state.status === "recalling" && before.status !== "recalling" && c) {
      announce(`Recall. Enter ${c.length} tokens in order. Keys 1 to 8 select, Backspace removes, Enter submits.`);
    }

    if (state.status === "feedback" && before.status === "recalling" && c && state.config) {
      if (sound) playCue("correct");
      // The next challenge is announced here, before any token speech starts,
      // so an announcement and a spoken token never talk over each other.
      const d = difficultyFor(state.config.rules, state.config.offset + state.completed);
      const quote = successLine?.(state.completed);
      announce(
        `Correct. Plus ${describeFei(state.lastContributionMs)}. Total ${describeFei(state.feiMs)}. ` +
          (quote ? `${quote} ` : "") +
          `Next: ${challengeIntro(c.index + 2, d.length, d.durationMs)}`,
      );
    }

    if (state.status === "ended" && before.status !== "ended") {
      if (sound) playCue("end");
      announce(
        state.endReason === "mismatch" && state.failure
          ? `${mismatchSentence(state.failure.mismatches)} Run complete. Your pattern and the correct pattern are shown.`
          : "Run ended.",
        "assertive",
      );
    }

    if (state.status === "paused" && before.status !== "paused") announce("Paused.");
  }, [state, spoken, sound, successLine]);

  const select = useCallback(
    (token: TokenId) => {
      if (state.status !== "recalling" || !state.challenge) return;
      if (state.answer.length >= state.challenge.length) {
        announce("All positions are filled. Submit, or remove a token first.");
        return;
      }
      dispatch({ type: "select", token });
      announce(`${tokenLabel(token)}. ${state.answer.length + 1} of ${state.challenge.length}.`);
    },
    [state.status, state.challenge, state.answer.length],
  );

  const undo = useCallback(() => {
    if (state.status !== "recalling" || state.answer.length === 0 || !state.challenge) return;
    dispatch({ type: "undo" });
    announce(`Removed. ${state.answer.length - 1} of ${state.challenge.length}.`);
  }, [state.status, state.answer.length, state.challenge]);

  const clear = useCallback(() => {
    if (state.status !== "recalling" || state.answer.length === 0) return;
    dispatch({ type: "clear" });
    announce("Answer cleared.");
  }, [state.status, state.answer.length]);

  const submit = useCallback(() => {
    if (state.status !== "recalling" || !state.challenge) return;
    const missing = state.challenge.length - state.answer.length;
    if (missing > 0) {
      announce(`Fill all positions first. ${missing} to go.`);
      return;
    }
    dispatch({ type: "submit" });
  }, [state.status, state.challenge, state.answer.length]);

  return { state, dispatch, select, undo, clear, submit };
}
