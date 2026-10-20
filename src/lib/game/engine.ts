/**
 * The game engine: a pure reducer over an explicit state machine.
 *
 *   idle -> prepare -> countdown -> observing -> recalling -> feedback -> observing ...
 *                                                     \-> ended (mismatch)
 *   any in-run state <-> paused        any in-run state -> ended (exited)
 *
 * The reducer knows nothing about clocks. Timed phases (countdown, observing,
 * feedback) advance only on a `tick` action, and every tick carries the
 * `epoch` it was scheduled for. Every transition bumps the epoch, so a timer
 * that was scheduled before a pause, a restart or a submit can never advance
 * the new state: its tick is simply ignored. That one rule is what prevents
 * overlapping timers, stale updates and double scoring.
 *
 * Client-side secrecy: the full sequence lives in this state, in browser
 * memory, for the length of a challenge. The UI only ever renders the token
 * currently being shown, and nothing after the observe phase, but a browser
 * game cannot hide data from its own developer tools. Treat the client as
 * untrusted; the server re-verifies every ranked run (see verify.ts).
 */
import { dailySeed } from "./daily";
import {
  RULESETS,
  difficultyFor,
  practiceLevel,
  type Division,
  type PracticeLevelId,
  type Ruleset,
} from "./rules";
import { challengeContributionMs } from "./scoring";
import { generateSequence, reviewPositions, sequencesMatch } from "./sequence";
import type { TokenId } from "./tokens";

export const COUNTDOWN_FROM = 3;
export const COUNTDOWN_STEP_MS = 800;
/** Blank interval between two tokens, so a repeated token reads as two. */
export const GAP_MS = 300;
/** Dissolve after the last token, before recall opens. */
export const DISSOLVE_MS = 450;
/** Long enough to read a short line after a correct round; it never affects score. */
export const FEEDBACK_MS = 1600;

export type RunMode =
  | { kind: "daily"; dateKey: string; division: Division; /** 1 or 2. */ attempt: number }
  | {
      kind: "practice";
      division: Division;
      level: PracticeLevelId;
      /** Set when the player chose a shareable seed; null for a random one. */
      customSeed: string | null;
    };

export interface RunConfig {
  mode: RunMode;
  seed: string;
  rules: Ruleset;
  /** Completed challenges the run starts from on the schedule (practice levels). */
  offset: number;
}

export function dailyConfig(dateKey: string, division: Division, attempt = 1): RunConfig {
  return {
    mode: { kind: "daily", dateKey, division, attempt },
    seed: dailySeed(dateKey, division, attempt),
    rules: RULESETS[division],
    offset: 0,
  };
}

export function practiceConfig(
  division: Division,
  level: PracticeLevelId,
  seed: string,
  customSeed: string | null = null,
): RunConfig {
  return {
    mode: { kind: "practice", division, level, customSeed },
    seed: customSeed ? `synapse-practice:${customSeed}` : seed,
    rules: RULESETS[division],
    offset: practiceLevel(level).offset,
  };
}

/** Stats and records are kept per category so modes never mix. */
export function categoryOf(mode: RunMode): string {
  return mode.kind === "daily"
    ? `daily:${mode.division}`
    : `practice:${mode.division}:${mode.level}`;
}

export interface Challenge {
  index: number;
  length: number;
  durationMs: number;
  sequence: readonly TokenId[];
}

/** Shared by the engine and the server-side verifier, so both build identical challenges. */
export function buildChallenge(config: RunConfig, index: number): Challenge {
  const { length, durationMs } = difficultyFor(config.rules, config.offset + index);
  return { index, length, durationMs, sequence: generateSequence(config.seed, index, length) };
}

export interface ChallengeRecord {
  index: number;
  length: number;
  durationMs: number;
  answer: TokenId[];
  correct: boolean;
  contributionMs: number;
}

/**
 * The challenge that ended a run, kept exactly as it was played. The results
 * screen reads this record; it never rebuilds the comparison from UI state.
 * It exists only after a submission, so nothing about the correct pattern is
 * available before the player has answered.
 */
export interface FailureRecord {
  index: number;
  length: number;
  durationMs: number;
  expected: readonly TokenId[];
  answer: readonly TokenId[];
  /** 1-based positions where the answer differed. */
  mismatches: number[];
}

export type Status =
  | "idle"
  | "prepare"
  | "countdown"
  | "observing"
  | "recalling"
  | "feedback"
  | "paused"
  | "ended";

export type PausableStatus = "countdown" | "observing" | "recalling" | "feedback";
export type EndReason = "mismatch" | "exited" | "interrupted";

export interface GameState {
  config: RunConfig | null;
  runId: number;
  epoch: number;
  status: Status;
  pausedFrom: PausableStatus | null;
  countdown: number;
  challenge: Challenge | null;
  /** Even steps show token step/2; odd steps are the gap after it. */
  observeStep: number;
  answer: TokenId[];
  history: ChallengeRecord[];
  completed: number;
  streak: number;
  bestStreak: number;
  feiMs: number;
  maxLengthCompleted: number;
  lastContributionMs: number;
  endReason: EndReason | null;
  failure: FailureRecord | null;
}

export const initialGameState: GameState = {
  config: null,
  runId: 0,
  epoch: 0,
  status: "idle",
  pausedFrom: null,
  countdown: COUNTDOWN_FROM,
  challenge: null,
  observeStep: 0,
  answer: [],
  history: [],
  completed: 0,
  streak: 0,
  bestStreak: 0,
  feiMs: 0,
  maxLengthCompleted: 0,
  lastContributionMs: 0,
  endReason: null,
  failure: null,
};

export type GameAction =
  | { type: "start"; config: RunConfig; skipPrepare?: boolean }
  | { type: "begin" }
  | { type: "tick"; epoch: number }
  | { type: "select"; token: TokenId }
  | { type: "undo" }
  | { type: "clear" }
  | { type: "submit" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "exit" }
  | { type: "reset" };

const PAUSABLE: ReadonlySet<Status> = new Set(["countdown", "observing", "recalling", "feedback"]);
const IN_RUN: ReadonlySet<Status> = new Set([
  "countdown",
  "observing",
  "recalling",
  "feedback",
  "paused",
]);

export function isInRun(status: Status): boolean {
  return IN_RUN.has(status);
}

function next(state: GameState, patch: Partial<GameState>): GameState {
  return { ...state, ...patch, epoch: state.epoch + 1 };
}

function freshRun(config: RunConfig, runId: number, epoch: number): GameState {
  return { ...initialGameState, config, runId, epoch, status: "prepare" };
}

function startChallenge(state: GameState, index: number): GameState {
  if (!state.config) return state;
  return next(state, {
    status: "observing",
    challenge: buildChallenge(state.config, index),
    observeStep: 0,
    answer: [],
  });
}

function observeStepCount(challenge: Challenge): number {
  return challenge.length * 2;
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "start": {
      const run = freshRun(action.config, state.runId + 1, state.epoch + 1);
      return action.skipPrepare ? next(run, { status: "countdown", countdown: COUNTDOWN_FROM }) : run;
    }

    case "begin":
      if (state.status !== "prepare") return state;
      return next(state, { status: "countdown", countdown: COUNTDOWN_FROM });

    case "tick": {
      if (action.epoch !== state.epoch) return state;
      if (state.status === "countdown") {
        if (state.countdown > 1) return next(state, { countdown: state.countdown - 1 });
        return startChallenge(state, 0);
      }
      if (state.status === "observing" && state.challenge) {
        const step = state.observeStep + 1;
        if (step >= observeStepCount(state.challenge)) {
          return next(state, { status: "recalling", observeStep: step, answer: [] });
        }
        return next(state, { observeStep: step });
      }
      if (state.status === "feedback" && state.challenge) {
        return startChallenge(state, state.challenge.index + 1);
      }
      return state;
    }

    case "select": {
      if (state.status !== "recalling" || !state.challenge) return state;
      if (state.answer.length >= state.challenge.length) return state;
      return { ...state, answer: [...state.answer, action.token] };
    }

    case "undo":
      if (state.status !== "recalling" || state.answer.length === 0) return state;
      return { ...state, answer: state.answer.slice(0, -1) };

    case "clear":
      if (state.status !== "recalling" || state.answer.length === 0) return state;
      return { ...state, answer: [] };

    case "submit": {
      const c = state.challenge;
      if (state.status !== "recalling" || !c || state.answer.length !== c.length) return state;
      const correct = sequencesMatch(c.sequence, state.answer);
      const contributionMs = correct ? challengeContributionMs(c.length, c.durationMs) : 0;
      const record: ChallengeRecord = {
        index: c.index,
        length: c.length,
        durationMs: c.durationMs,
        answer: state.answer,
        correct,
        contributionMs,
      };
      const history = [...state.history, record];
      if (!correct) {
        // Score, completed count and difficulty are left exactly as they were.
        const failure: FailureRecord = {
          index: c.index,
          length: c.length,
          durationMs: c.durationMs,
          expected: c.sequence,
          answer: state.answer,
          mismatches: reviewPositions(c.sequence, state.answer)
            .filter((p) => !p.correct)
            .map((p) => p.position),
        };
        return next(state, { status: "ended", endReason: "mismatch", history, lastContributionMs: 0, failure });
      }
      const streak = state.streak + 1;
      return next(state, {
        status: "feedback",
        history,
        completed: state.completed + 1,
        streak,
        bestStreak: Math.max(state.bestStreak, streak),
        feiMs: state.feiMs + contributionMs,
        maxLengthCompleted: Math.max(state.maxLengthCompleted, c.length),
        lastContributionMs: contributionMs,
      });
    }

    case "pause":
      if (!PAUSABLE.has(state.status)) return state;
      return next(state, { status: "paused", pausedFrom: state.status as PausableStatus });

    case "resume": {
      if (state.status !== "paused" || !state.pausedFrom) return state;
      const from = state.pausedFrom;
      if (from === "countdown") {
        return next(state, { status: "countdown", pausedFrom: null, countdown: COUNTDOWN_FROM });
      }
      if (from === "observing" && state.challenge) {
        // An interrupted token is shown again in full; a finished one is not.
        let step = state.observeStep;
        if (step % 2 === 1) step += 1;
        if (step >= observeStepCount(state.challenge)) {
          return next(state, { status: "recalling", pausedFrom: null, observeStep: step, answer: [] });
        }
        return next(state, { status: "observing", pausedFrom: null, observeStep: step });
      }
      return next(state, { status: from, pausedFrom: null });
    }

    case "exit": {
      if (!IN_RUN.has(state.status)) return state;
      // Leaving before any sequence has been shown costs nothing.
      if (state.challenge === null) return next(state, { status: "prepare", pausedFrom: null });
      return next(state, { status: "ended", endReason: "exited", pausedFrom: null });
    }

    case "reset":
      return { ...initialGameState, runId: state.runId + 1, epoch: state.epoch + 1 };
  }
}

/** How long the current phase lasts before the next tick, or null if untimed. */
export function phaseDelay(state: GameState): number | null {
  switch (state.status) {
    case "countdown":
      return COUNTDOWN_STEP_MS;
    case "observing": {
      const c = state.challenge;
      if (!c) return null;
      if (state.observeStep % 2 === 0) return c.durationMs;
      return state.observeStep >= observeStepCount(c) - 1 ? DISSOLVE_MS : GAP_MS;
    }
    case "feedback":
      return FEEDBACK_MS;
    default:
      return null;
  }
}

/** The token currently on screen, or null between tokens and outside observing. */
export function visibleToken(state: GameState): TokenId | null {
  if (state.status !== "observing" || !state.challenge) return null;
  if (state.observeStep % 2 !== 0) return null;
  return state.challenge.sequence[state.observeStep / 2] ?? null;
}

/** 1-based position of the token being shown, or of the gap after it. */
export function observePosition(state: GameState): number {
  return Math.floor(state.observeStep / 2) + 1;
}
