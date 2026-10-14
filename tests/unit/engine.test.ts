import { describe, expect, it } from "vitest";
import {
  COUNTDOWN_FROM,
  DISSOLVE_MS,
  FEEDBACK_MS,
  GAP_MS,
  buildChallenge,
  dailyConfig,
  gameReducer,
  initialGameState,
  phaseDelay,
  practiceConfig,
  visibleToken,
  type GameAction,
  type GameState,
} from "@/lib/game/engine";
import { TOKEN_IDS, type TokenId } from "@/lib/game/tokens";

const config = practiceConfig("standard", "foundation", "unit-seed");

function run(state: GameState, ...actions: GameAction[]): GameState {
  return actions.reduce(gameReducer, state);
}

function tick(state: GameState): GameState {
  return gameReducer(state, { type: "tick", epoch: state.epoch });
}

/** Ticks until the given status is reached, with a guard against loops. */
function tickUntil(state: GameState, status: GameState["status"]): GameState {
  let s = state;
  for (let i = 0; i < 200 && s.status !== status; i++) s = tick(s);
  expect(s.status).toBe(status);
  return s;
}

function startToRecall(): GameState {
  const s = run(initialGameState, { type: "start", config }, { type: "begin" });
  return tickUntil(s, "recalling");
}

function answerWith(state: GameState, tokens: readonly TokenId[]): GameState {
  return tokens.reduce((s, token) => gameReducer(s, { type: "select", token }), state);
}

function wrongToken(t: TokenId): TokenId {
  return TOKEN_IDS.find((x) => x !== t)!;
}

function solveCurrent(state: GameState): GameState {
  return run(answerWith(state, state.challenge!.sequence), { type: "submit" });
}

describe("run lifecycle", () => {
  it("starts in prepare, then counts down from three", () => {
    let s = run(initialGameState, { type: "start", config });
    expect(s.status).toBe("prepare");
    s = gameReducer(s, { type: "begin" });
    expect(s.status).toBe("countdown");
    expect(s.countdown).toBe(COUNTDOWN_FROM);
    s = tick(s);
    expect(s.countdown).toBe(2);
    s = tick(tick(s));
    expect(s.status).toBe("observing");
    expect(s.challenge?.length).toBe(3);
    expect(s.challenge?.durationMs).toBe(1500);
  });

  it("can skip the prepare screen on restart", () => {
    const s = run(initialGameState, { type: "start", config, skipPrepare: true });
    expect(s.status).toBe("countdown");
  });

  it("shows each token, then a gap, then dissolves into recall", () => {
    let s = tickUntil(run(initialGameState, { type: "start", config, skipPrepare: true }), "observing");
    const seq = s.challenge!.sequence;
    const seen: (TokenId | null)[] = [];
    const delays: (number | null)[] = [];
    while (s.status === "observing") {
      seen.push(visibleToken(s));
      delays.push(phaseDelay(s));
      s = tick(s);
    }
    expect(seen).toEqual([seq[0], null, seq[1], null, seq[2], null]);
    expect(delays).toEqual([1500, GAP_MS, 1500, GAP_MS, 1500, DISSOLVE_MS]);
    expect(s.status).toBe("recalling");
    expect(visibleToken(s)).toBeNull();
  });
});

describe("recall input", () => {
  it("fills positions in order, undoes and clears", () => {
    let s = startToRecall();
    s = answerWith(s, ["circle", "square"]);
    expect(s.answer).toEqual(["circle", "square"]);
    s = gameReducer(s, { type: "undo" });
    expect(s.answer).toEqual(["circle"]);
    s = gameReducer(s, { type: "clear" });
    expect(s.answer).toEqual([]);
  });

  it("does not accept more tokens than the sequence length", () => {
    const s = answerWith(startToRecall(), ["circle", "circle", "circle", "circle", "circle"]);
    expect(s.answer).toHaveLength(3);
  });

  it("accepts repeated tokens", () => {
    const s = answerWith(startToRecall(), ["star", "star"]);
    expect(s.answer).toEqual(["star", "star"]);
  });

  it("ignores input outside the recall phase", () => {
    const s = run(initialGameState, { type: "start", config, skipPrepare: true });
    expect(gameReducer(s, { type: "select", token: "circle" })).toBe(s);
  });

  it("refuses an empty or incomplete submission", () => {
    const empty = startToRecall();
    expect(gameReducer(empty, { type: "submit" })).toBe(empty);
    const partial = answerWith(empty, [empty.challenge!.sequence[0]!]);
    expect(gameReducer(partial, { type: "submit" })).toBe(partial);
  });
});

describe("scoring through the reducer", () => {
  it("banks length x duration once for a correct answer", () => {
    const s = solveCurrent(startToRecall());
    expect(s.status).toBe("feedback");
    expect(s.feiMs).toBe(3 * 1500);
    expect(s.completed).toBe(1);
    expect(s.streak).toBe(1);
    expect(s.lastContributionMs).toBe(4500);
  });

  it("cannot double score a challenge by submitting twice", () => {
    const once = solveCurrent(startToRecall());
    const twice = gameReducer(once, { type: "submit" });
    expect(twice).toBe(once);
    expect(twice.feiMs).toBe(4500);
  });

  it("ends the run on the right tokens in the wrong order", () => {
    let s = startToRecall();
    const seq = [...s.challenge!.sequence];
    // Rebuild a sequence until a reversed order genuinely differs.
    const reversed = [...seq].reverse();
    const answer = reversed.join() === seq.join() ? [wrongToken(seq[0]!), ...seq.slice(1)] : reversed;
    s = run(answerWith(s, answer), { type: "submit" });
    expect(s.status).toBe("ended");
    expect(s.endReason).toBe("mismatch");
    expect(s.feiMs).toBe(0);
    expect(s.history[0]?.correct).toBe(false);
  });

  it("ends the run on a single wrong token without scoring it", () => {
    let s = startToRecall();
    const seq = s.challenge!.sequence;
    s = run(answerWith(s, [seq[0]!, seq[1]!, wrongToken(seq[2]!)]), { type: "submit" });
    expect(s.status).toBe("ended");
    expect(s.feiMs).toBe(0);
  });

  it("advances to the next challenge after feedback, with a fresh answer", () => {
    let s = solveCurrent(startToRecall());
    expect(phaseDelay(s)).toBe(FEEDBACK_MS);
    s = tick(s);
    expect(s.status).toBe("observing");
    expect(s.challenge?.index).toBe(1);
    expect(s.answer).toEqual([]);
  });

  it("follows the difficulty schedule across a long run", () => {
    let s = startToRecall();
    const lengths: number[] = [];
    let expectedFei = 0;
    for (let i = 0; i < 10; i++) {
      lengths.push(s.challenge!.length);
      expectedFei += s.challenge!.length * s.challenge!.durationMs;
      s = solveCurrent(s);
      s = tickUntil(tick(s), "recalling");
    }
    expect(lengths).toEqual([3, 3, 4, 4, 5, 5, 6, 6, 7, 7]);
    expect(s.challenge!.durationMs).toBe(1300);
    expect(s.feiMs).toBe(expectedFei);
    expect(s.completed).toBe(10);
    expect(s.bestStreak).toBe(10);
    expect(s.maxLengthCompleted).toBe(7);
  });
});

describe("timers and pause", () => {
  it("ignores a tick scheduled for an earlier epoch", () => {
    const s = run(initialGameState, { type: "start", config, skipPrepare: true });
    const stale = s.epoch;
    const advanced = tick(s);
    expect(gameReducer(advanced, { type: "tick", epoch: stale })).toBe(advanced);
  });

  it("does not advance while paused, and stale timers stay dead after resume", () => {
    let s = tickUntil(run(initialGameState, { type: "start", config, skipPrepare: true }), "observing");
    const scheduledEpoch = s.epoch;
    s = gameReducer(s, { type: "pause" });
    expect(s.status).toBe("paused");
    expect(phaseDelay(s)).toBeNull();
    expect(gameReducer(s, { type: "tick", epoch: s.epoch })).toBe(s);
    s = gameReducer(s, { type: "resume" });
    expect(s.status).toBe("observing");
    expect(gameReducer(s, { type: "tick", epoch: scheduledEpoch })).toBe(s);
  });

  it("re-shows an interrupted token in full on resume", () => {
    let s = tickUntil(run(initialGameState, { type: "start", config, skipPrepare: true }), "observing");
    s = tick(tick(s)); // second token is on screen
    expect(s.observeStep).toBe(2);
    s = run(s, { type: "pause" }, { type: "resume" });
    expect(s.observeStep).toBe(2);
    expect(visibleToken(s)).toBe(s.challenge!.sequence[1]);
  });

  it("does not replay a token that had finished when the pause landed in a gap", () => {
    let s = tickUntil(run(initialGameState, { type: "start", config, skipPrepare: true }), "observing");
    s = tick(s); // gap after the first token
    s = run(s, { type: "pause" }, { type: "resume" });
    expect(s.observeStep).toBe(2);
  });

  it("restarts the countdown when resumed from it", () => {
    let s = tick(run(initialGameState, { type: "start", config, skipPrepare: true }));
    expect(s.countdown).toBe(2);
    s = run(s, { type: "pause" }, { type: "resume" });
    expect(s.countdown).toBe(COUNTDOWN_FROM);
  });

  it("gives no score for time spent paused or waiting during recall", () => {
    let s = startToRecall();
    for (let i = 0; i < 5; i++) s = run(s, { type: "pause" }, { type: "resume" });
    s = solveCurrent(s);
    expect(s.feiMs).toBe(4500);
  });
});

describe("exit and restart", () => {
  it("exiting before any sequence is shown returns to prepare", () => {
    const s = run(initialGameState, { type: "start", config, skipPrepare: true }, { type: "exit" });
    expect(s.status).toBe("prepare");
  });

  it("exiting mid-run ends it and keeps the banked score", () => {
    let s = solveCurrent(startToRecall());
    s = tickUntil(tick(s), "recalling");
    s = gameReducer(s, { type: "exit" });
    expect(s.status).toBe("ended");
    expect(s.endReason).toBe("exited");
    expect(s.feiMs).toBe(4500);
  });

  it("a fresh start resets every run counter", () => {
    let s = solveCurrent(startToRecall());
    s = gameReducer(s, { type: "start", config, skipPrepare: true });
    expect(s).toMatchObject({
      status: "countdown",
      feiMs: 0,
      completed: 0,
      streak: 0,
      bestStreak: 0,
      history: [],
      answer: [],
      challenge: null,
      endReason: null,
    });
  });

  it("a restart with the same seed replays the same first sequence", () => {
    const a = startToRecall().challenge!.sequence;
    const b = startToRecall().challenge!.sequence;
    expect(a).toEqual(b);
  });
});

describe("configs", () => {
  it("daily runs of the same date share sequences; divisions differ", () => {
    const a = buildChallenge(dailyConfig("2026-10-13", "standard"), 4);
    const b = buildChallenge(dailyConfig("2026-10-13", "standard"), 4);
    const c = buildChallenge(dailyConfig("2026-10-13", "spoken"), 4);
    expect(a).toEqual(b);
    expect(a.sequence).not.toEqual(c.sequence);
  });

  it("practice levels start further along the same schedule", () => {
    const deep = buildChallenge(practiceConfig("standard", "deep", "x"), 0);
    expect(deep.length).toBe(9);
    expect(deep.durationMs).toBe(1200);
  });

  it("a custom practice seed is shareable and reproducible", () => {
    const a = buildChallenge(practiceConfig("standard", "foundation", "ignored-1", "ORBIT"), 0);
    const b = buildChallenge(practiceConfig("standard", "foundation", "ignored-2", "ORBIT"), 0);
    expect(a.sequence).toEqual(b.sequence);
  });
});
