"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Dialog } from "@/components/Dialog";
import { Mark } from "@/components/Wordmark";
import { useGameSession } from "@/hooks/useGameSession";
import { dailyConfig, isInRun, practiceConfig, type GameState, type RunConfig } from "@/lib/game/engine";
import { formatCountdown, msUntilNextUtcDay, utcDateKey } from "@/lib/game/daily";
import { randomSeed } from "@/lib/game/random";
import { difficultyFor, isPracticeLevelId, type Division, type PracticeLevelId } from "@/lib/game/rules";
import { describeFei, formatFei } from "@/lib/game/scoring";
import { tokenForKey } from "@/lib/game/tokens";
import { replayRun } from "@/lib/game/verify";
import { speechSupported } from "@/lib/media";
import { selectQuote } from "@/lib/quotes";
import { advanceQuotes, quoteCursor } from "@/lib/quoteSession";
import { createValueStore, useValueStore } from "@/lib/valueStore";
import { dailyKey, recordRun, type RunSummary, type StoredData } from "@/lib/storage/schema";
import { updateData, updateSettings, useStoredData } from "@/lib/storage/store";
import { FocusMetrics } from "./FocusMetrics";
import { PostScore } from "./PostScore";
import { PrepareScreen } from "./PrepareScreen";
import { SequenceDisplay, SequenceSlots } from "./SequenceDisplay";
import { SessionResults, modeTitle, type RunResult } from "./SessionResults";
import { TokenInput } from "./TokenInput";

const SEED_PATTERN = /^[A-Za-z0-9-]{1,24}$/;

/** Reads the URL and local records, then hands a fixed setup to the controller. */
export function GameScreen() {
  const params = useSearchParams();
  const data = useStoredData();
  if (!data) {
    return (
      <AppShell>
        <p className="pt-12 text-ink-2">Preparing the session.</p>
      </AppShell>
    );
  }
  const mode = params.get("mode") === "daily" ? "daily" : "practice";
  const level = params.get("level");
  const seed = params.get("seed");
  return (
    <GameController
      initial={data}
      mode={mode}
      level={isPracticeLevelId(level) ? level : null}
      customSeed={seed && SEED_PATTERN.test(seed) ? seed.toUpperCase() : null}
    />
  );
}

function summarize(state: GameState): RunSummary | null {
  if (!state.config || !state.endReason) return null;
  return {
    mode: state.config.mode,
    feiMs: state.feiMs,
    completed: state.completed,
    maxLength: state.maxLengthCompleted,
    bestStreak: state.bestStreak,
    endReason: state.endReason,
    answers: state.history.map((h) => [...h.answer]),
    endedAt: Date.now(),
  };
}

function GameController({
  initial,
  mode,
  level,
  customSeed,
}: {
  initial: StoredData;
  mode: "daily" | "practice";
  level: PracticeLevelId | null;
  customSeed: string | null;
}) {
  const [setup] = useState(() => {
    const wantsSpoken = initial.settings.presentation === "spoken";
    const canSpeak = speechSupported();
    const division: Division = wantsSpoken && canSpeak ? "spoken" : "standard";
    const dateKey = utcDateKey(new Date());
    const config: RunConfig =
      mode === "daily"
        ? dailyConfig(dateKey, division)
        : practiceConfig(division, level ?? initial.settings.practiceLevel, randomSeed(), customSeed);
    return { config, division, dateKey, spokenUnavailable: wantsSpoken && !canSpeak };
  });

  const data = useStoredData() ?? initial;

  // Quotes: each run reads the session cursor once, then the n-th held
  // challenge shows line base + n - 1. The cursor advances as lines are shown,
  // so the next run continues where this one stopped.
  const [autostart] = useState(() => mode === "practice" && initial.settings.rulesSeen);
  const [runId, setRunId] = useState(0);
  const quoteBase = useMemo(() => ({ runId, ...quoteCursor() }), [runId]);
  const successLine = useCallback(
    (completed: number) => (completed > 0 ? selectQuote("success", quoteBase.seed, quoteBase.success + completed - 1).text : null),
    [quoteBase],
  );

  const { state, dispatch, select, undo, clear, submit } = useGameSession(setup.config, {
    spoken: setup.division === "spoken",
    sound: data.settings.sound,
    autostart,
    successLine,
  });
  if (state.runId !== runId) setRunId(state.runId);

  const [resultStore] = useState(() => createValueStore<RunResult | null>(null));
  const result = useValueStore(resultStore, null);
  const [confirmExit, setConfirmExit] = useState(false);
  const startedHere = useRef(false);
  const recordedRun = useRef<number | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const firstKeyRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);

  const daily = setup.config.mode.kind === "daily";
  const key = dailyKey(setup.dateKey, setup.division);

  // A daily run left in progress by a reload or closed tab is finalised from
  // its stored answers. Its score comes from replaying them, never from storage.
  useEffect(() => {
    if (!daily) return;
    const out: { value: Omit<RunResult, "failure" | "quote"> | null } = { value: null };
    updateData((d) => {
      const entry = d.daily[key];
      if (!entry || entry.status !== "in-progress") return d;
      const replay = replayRun(setup.config, entry.answers);
      const summary: RunSummary = {
        mode: setup.config.mode,
        feiMs: replay.valid ? replay.feiMs : 0,
        completed: replay.valid ? replay.completed : 0,
        maxLength: replay.valid ? replay.maxLength : 0,
        bestStreak: replay.valid ? replay.completed : 0,
        endReason: "interrupted",
        answers: entry.answers,
        endedAt: Date.now(),
      };
      const rec = recordRun(d, summary);
      out.value = { summary, previousBestMs: rec.previousBestMs, isPersonalBest: rec.isPersonalBest };
      return rec.data;
    });
    if (out.value) resultStore.set({ ...out.value, failure: null, quote: null });
  }, [daily, key, setup.config, resultStore]);

  // Ranked progress is written as the run happens, so leaving cannot reset it.
  useEffect(() => {
    if (!daily || !state.challenge) return;
    if (state.status === "observing" && state.challenge.index === 0 && state.observeStep === 0 && !startedHere.current) {
      startedHere.current = true;
      updateData((d) => ({
        ...d,
        daily: {
          ...d.daily,
          [key]: {
            status: "in-progress",
            answers: [],
            feiMs: 0,
            completed: 0,
            maxLength: 0,
            bestStreak: 0,
            endReason: null,
            posted: "no",
            rank: null,
          },
        },
      }));
    }
    if (state.status === "feedback" && startedHere.current) {
      const answers = state.history.map((h) => [...h.answer]);
      updateData((d) => {
        const entry = d.daily[key];
        if (!entry || entry.status !== "in-progress") return d;
        return {
          ...d,
          daily: {
            ...d.daily,
            [key]: { ...entry, answers, feiMs: state.feiMs, completed: state.completed, maxLength: state.maxLengthCompleted, bestStreak: state.bestStreak },
          },
        };
      });
    }
  }, [daily, key, state]);

  // Record a finished run exactly once.
  useEffect(() => {
    if (state.status !== "ended" || recordedRun.current === state.runId) return;
    const summary = summarize(state);
    if (!summary) return;
    recordedRun.current = state.runId;
    const rec: { value: ReturnType<typeof recordRun> | null } = { value: null };
    updateData((d) => {
      rec.value = recordRun(d, summary);
      return rec.value.data;
    });
    // The comparison comes from the engine's failure record, never from UI state.
    const failure = state.endReason === "mismatch" ? state.failure : null;
    let quote = null;
    if (failure) {
      const cursor = quoteCursor();
      quote = selectQuote("failure", cursor.seed, cursor.failure);
      advanceQuotes("failure");
    }
    const r = rec.value;
    resultStore.set({
      summary,
      previousBestMs: r?.previousBestMs ?? null,
      isPersonalBest: r?.isPersonalBest ?? false,
      failure,
      quote,
    });
  }, [state, resultStore]);

  // One success line per held challenge.
  const feedbackEpoch = state.status === "feedback" ? state.epoch : null;
  useEffect(() => {
    if (feedbackEpoch !== null) advanceQuotes("success");
  }, [feedbackEpoch]);

  // Focus follows the phase: keypad for recall, stage otherwise.
  const status = state.status;
  useEffect(() => {
    if (status === "recalling") firstKeyRef.current?.focus({ preventScroll: true });
    else if (status === "countdown" || status === "feedback") stageRef.current?.focus({ preventScroll: true });
    else if (status === "prepare") headingRef.current?.focus({ preventScroll: true });
  }, [status]);
  useEffect(() => {
    if (result) resultHeadingRef.current?.focus();
  }, [result]);

  const begin = useCallback(() => {
    if (!data.settings.rulesSeen) updateSettings({ rulesSeen: true });
    dispatch({ type: "begin" });
  }, [data.settings.rulesSeen, dispatch]);

  const restart = useCallback(() => {
    const prev = state.config;
    if (!prev || prev.mode.kind !== "practice") return;
    const config = practiceConfig(prev.mode.division, prev.mode.level, randomSeed(), prev.mode.customSeed);
    resultStore.set(null);
    dispatch({ type: "start", config, skipPrepare: true });
  }, [state.config, dispatch, resultStore]);

  const requestExit = useCallback(() => {
    if (daily && state.challenge) {
      dispatch({ type: "pause" });
      setConfirmExit(true);
    } else {
      dispatch({ type: "exit" });
    }
  }, [daily, state.challenge, dispatch]);

  // Keyboard play. Digits pick tokens; Enter and Space are left to a focused
  // button so one key press can never both pick and submit.
  const full = !!state.challenge && state.answer.length === state.challenge.length;
  const handlers = useRef({ select, undo, clear, submit, status, dispatch, full });
  useEffect(() => {
    handlers.current = { select, undo, clear, submit, status, dispatch, full };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const h = handlers.current;
      if (!isInRun(h.status) || h.status === "paused") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape" || e.key === "p" || e.key === "P") {
        e.preventDefault();
        h.dispatch({ type: "pause" });
        return;
      }
      if (h.status !== "recalling") return;
      const token = tokenForKey(e.key);
      if (token) {
        e.preventDefault();
        if (!e.repeat) h.select(token);
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        h.undo();
      } else if (e.key === "Delete") {
        e.preventDefault();
        h.clear();
      } else if (e.key === "Enter") {
        const el = document.activeElement;
        // On a token key with a complete answer, Enter cannot add a token, so it submits.
        const onTokenKey = el instanceof HTMLElement && el.classList.contains("token-key");
        if (!(onTokenKey && h.full) && (el instanceof HTMLButtonElement || el instanceof HTMLInputElement)) return;
        e.preventDefault();
        if (!e.repeat) h.submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Results take priority, then a finished daily, then the run itself.
  if (result) {
    return (
      <AppShell>
        <SessionResults ref={resultHeadingRef} result={result} onRestart={daily ? null : restart} />
      </AppShell>
    );
  }

  const entry = data.daily[key];
  if (daily && entry?.status === "finished") {
    return <DailyComplete dateKey={setup.dateKey} division={setup.division} entry={entry} />;
  }

  if (state.status === "prepare" || state.status === "idle" || !state.config) {
    return (
      <AppShell>
        <PrepareScreen
          ref={headingRef}
          config={state.config ?? setup.config}
          spokenUnavailable={setup.spokenUnavailable}
          onBegin={begin}
        />
      </AppShell>
    );
  }

  const c = state.challenge;
  // During the feedback beat the strip already shows the coming round.
  const upcoming = state.status === "feedback" || !c;
  const shown = upcoming ? difficultyFor(state.config.rules, state.config.offset + state.completed) : c;
  const roundQuote = state.status === "feedback" ? successLine(state.completed) : null;

  return (
    <div className="game-root">
      <header className="mx-auto flex w-full max-w-[34rem] items-center justify-between gap-2 px-4 pt-1 [@media(orientation:landscape)_and_(max-height:540px)]:max-w-[52rem]">
        <div className="flex min-w-0 items-center gap-2">
          <Mark className="size-5 shrink-0" />
          <p className="label truncate">{modeTitle(state.config.mode)}</p>
        </div>
        <div className="-mr-2 flex shrink-0">
          <button type="button" className="btn btn-quiet min-h-11 px-2.5" onClick={() => dispatch({ type: "pause" })} aria-keyshortcuts="Escape">
            <Pause aria-hidden="true" className="size-4" />
            Pause
          </button>
          <button type="button" className="btn btn-quiet min-h-11 px-2.5" onClick={requestExit}>
            <X aria-hidden="true" className="size-4" />
            Exit
          </button>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="game-main outline-none">
        <h1 className="sr-only">
          {modeTitle(state.config.mode)}. {c ? `Challenge ${c.index + 1}` : "Starting"}
        </h1>
        <FocusMetrics
          challenge={upcoming ? state.completed + 1 : c.index + 1}
          length={shown.length}
          durationMs={shown.durationMs}
          feiMs={state.feiMs}
        />
        <SequenceDisplay ref={stageRef} state={state} spoken={setup.division === "spoken"} quote={roundQuote} />
        <SequenceSlots state={state} />
        <TokenInput
          ref={firstKeyRef}
          active={state.status === "recalling"}
          filled={state.answer.length}
          length={c?.length ?? 0}
          onSelect={select}
          onUndo={undo}
          onClear={clear}
          onSubmit={submit}
        />
      </main>

      <Dialog
        open={state.status === "paused" && !confirmExit}
        onCancel={() => dispatch({ type: "resume" })}
        labelledBy="pause-title"
        describedBy="pause-desc"
      >
        <h2 id="pause-title" className="text-title font-semibold">
          Paused
        </h2>
        <p id="pause-desc" className="mt-2 text-ink-2">
          The sequence is hidden and nothing is scored while paused.
          {state.pausedFrom === "observing" ? " Resuming shows the interrupted token again from the start." : ""}
        </p>
        <p className="mt-4 num text-small">
          Banked FEI {formatFei(state.feiMs)}
          <span className="sr-only"> ({describeFei(state.feiMs)})</span>
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" data-autofocus className="btn btn-primary" onClick={() => dispatch({ type: "resume" })}>
            Resume
          </button>
          <button type="button" className="btn btn-secondary" onClick={requestExit}>
            End run
          </button>
        </div>
      </Dialog>

      <Dialog open={confirmExit} onCancel={() => setConfirmExit(false)} labelledBy="exit-title" describedBy="exit-desc">
        <h2 id="exit-title" className="text-title font-semibold">
          End today&apos;s ranked run?
        </h2>
        <p id="exit-desc" className="mt-2 text-ink-2">
          Your FEI so far, <span className="num text-ink">{formatFei(state.feiMs)}</span>, is banked. Today&apos;s
          challenge cannot be replayed.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" data-autofocus className="btn btn-primary" onClick={() => setConfirmExit(false)}>
            Keep playing
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setConfirmExit(false);
              dispatch({ type: "exit" });
            }}
          >
            End run
          </button>
        </div>
      </Dialog>
    </div>
  );
}

function DailyComplete({
  dateKey,
  division,
  entry,
}: {
  dateKey: string;
  division: Division;
  entry: NonNullable<StoredData["daily"][string]>;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus({ preventScroll: true }), []);
  const resetIn = formatCountdown(msUntilNextUtcDay(new Date()));
  return (
    <AppShell>
      <div className="pt-8 sm:pt-12">
        <p className="label">{modeTitle({ kind: "daily", dateKey, division })}</p>
        <h1 ref={headingRef} tabIndex={-1} className="mt-2 text-headline font-semibold outline-none">
          Today&apos;s run is in.
        </h1>
        <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-4 border-y border-ink py-4">
          <div>
            <dt className="label">Focus Endurance Index</dt>
            <dd className="num mt-1 text-metric">
              <span aria-hidden="true">{formatFei(entry.feiMs)}</span>
              <span className="sr-only">{describeFei(entry.feiMs)}</span>
            </dd>
          </div>
          <div>
            <dt className="label">Challenges</dt>
            <dd className="num mt-1 text-metric">{entry.completed}</dd>
          </div>
          <div>
            <dt className="label">Longest</dt>
            <dd className="num mt-1 text-metric">{entry.maxLength}</dd>
          </div>
        </dl>
        <p className="mt-4 text-ink-2">
          The next daily challenge opens in <span className="num whitespace-nowrap text-ink">{resetIn}</span> (00:00 UTC).
        </p>
        <div className="mt-6 grid gap-2 sm:flex">
          <Link href="/play?mode=practice" className="btn btn-primary sm:min-w-44">
            Practice
          </Link>
          <Link href={`/leaderboard?division=${division}`} className="btn btn-secondary">
            Leaderboard
          </Link>
        </div>
        <div className="mt-10">
          <PostScore dateKey={dateKey} division={division} />
        </div>
      </div>
    </AppShell>
  );
}
