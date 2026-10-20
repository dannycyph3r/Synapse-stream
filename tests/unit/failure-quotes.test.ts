import { describe, expect, it } from "vitest";
import {
  gameReducer,
  initialGameState,
  practiceConfig,
  visibleToken,
  type GameAction,
  type GameState,
} from "@/lib/game/engine";
import { difficultyFor } from "@/lib/game/rules";
import { TOKEN_IDS, type TokenId } from "@/lib/game/tokens";
import { FAILURE_QUOTES, QUOTES, SUCCESS_QUOTES, permutation, selectQuote } from "@/lib/quotes";

const config = practiceConfig("standard", "foundation", "failure-seed");

const run = (s: GameState, ...a: GameAction[]) => a.reduce(gameReducer, s);
const tick = (s: GameState) => gameReducer(s, { type: "tick", epoch: s.epoch });

function toRecall(s: GameState): GameState {
  let x = s;
  for (let i = 0; i < 200 && x.status !== "recalling"; i++) x = tick(x);
  expect(x.status).toBe("recalling");
  return x;
}

function answer(s: GameState, tokens: readonly TokenId[]): GameState {
  return run(s, ...tokens.map((token) => ({ type: "select", token }) as GameAction), { type: "submit" });
}

const other = (t: TokenId, avoid: TokenId[] = []) => TOKEN_IDS.find((x) => x !== t && !avoid.includes(x))!;

/** A run that has held `n` challenges and is now recalling challenge n + 1. */
function heldRun(n: number): GameState {
  let s = toRecall(run(initialGameState, { type: "start", config, skipPrepare: true }));
  for (let i = 0; i < n; i++) s = toRecall(tick(answer(s, s.challenge!.sequence)));
  return s;
}

describe("failure record", () => {
  it("does not exist before a submission", () => {
    let s = run(initialGameState, { type: "start", config, skipPrepare: true });
    while (s.status !== "recalling") {
      expect(s.failure).toBeNull();
      s = tick(s);
    }
    expect(s.failure).toBeNull();
  });

  it("keeps both the submitted pattern and the correct pattern", () => {
    const s = heldRun(0);
    const expected = [...s.challenge!.sequence];
    const given = [other(expected[0]!), expected[1]!, expected[2]!];
    const ended = answer(s, given);
    expect(ended.status).toBe("ended");
    expect(ended.failure).toEqual({
      index: 0,
      length: 3,
      durationMs: 1500,
      expected,
      answer: given,
      mismatches: [1],
    });
  });

  it("reports every mismatched position, 1-based", () => {
    const s = heldRun(0);
    const e = s.challenge!.sequence;
    const ended = answer(s, [e[0]!, other(e[1]!), other(e[2]!)]);
    expect(ended.failure?.mismatches).toEqual([2, 3]);
  });

  it("treats the right tokens in the wrong order as positional mismatches", () => {
    const s = heldRun(0);
    const e = s.challenge!.sequence;
    const rotated = [e[1]!, e[2]!, e[0]!];
    if (rotated.join() === e.join()) return; // all three identical cannot happen (max run of 2)
    const ended = answer(s, rotated);
    expect(ended.failure!.expected).toEqual(e);
    expect(ended.failure!.answer).toEqual(rotated);
    const expectedMismatches = e.map((t, i) => (t !== rotated[i] ? i + 1 : 0)).filter(Boolean);
    expect(ended.failure!.mismatches).toEqual(expectedMismatches);
  });

  it("compares repeated tokens position by position", () => {
    // Drive the reducer with a hand-built repeated challenge.
    const s = heldRun(0);
    const repeated: GameState = {
      ...s,
      challenge: { ...s.challenge!, sequence: ["star", "star", "arc"] },
    };
    const swapped = answer(repeated, ["star", "arc", "star"]);
    expect(swapped.failure!.mismatches).toEqual([2, 3]);
    const short = answer(repeated, ["star", "star", "star"]);
    expect(short.failure!.mismatches).toEqual([3]);
    const correct = answer(repeated, ["star", "star", "arc"]);
    expect(correct.status).toBe("feedback");
    expect(correct.failure).toBeNull();
  });

  it("leaves FEI, completed count and difficulty exactly as they were", () => {
    const s = heldRun(3);
    const before = { fei: s.feiMs, completed: s.completed, streak: s.streak, maxLen: s.maxLengthCompleted };
    const e = s.challenge!.sequence;
    const ended = answer(s, [other(e[0]!), ...e.slice(1)]);
    expect(ended.feiMs).toBe(before.fei);
    expect(ended.completed).toBe(before.completed);
    expect(ended.streak).toBe(before.streak);
    expect(ended.maxLengthCompleted).toBe(before.maxLen);
    expect(ended.lastContributionMs).toBe(0);
    // The next difficulty is what it would have been; nothing advanced.
    expect(difficultyFor(config.rules, config.offset + ended.completed)).toEqual({
      length: s.challenge!.length,
      durationMs: s.challenge!.durationMs,
    });
  });

  it("cannot be turned into another challenge or more score", () => {
    const s = heldRun(1);
    const e = s.challenge!.sequence;
    const ended = answer(s, [other(e[0]!), ...e.slice(1)]);
    const after = run(
      ended,
      { type: "tick", epoch: ended.epoch },
      { type: "select", token: "circle" },
      { type: "submit" },
      { type: "undo" },
      { type: "pause" },
      { type: "resume" },
    );
    expect(after).toBe(ended);
    expect(visibleToken(after)).toBeNull();
    expect(after.history.filter((h) => !h.correct)).toHaveLength(1);
  });

  it("is cleared by a restart, which starts from zero", () => {
    const s = heldRun(1);
    const e = s.challenge!.sequence;
    const ended = answer(s, [other(e[0]!), ...e.slice(1)]);
    const restarted = gameReducer(ended, { type: "start", config, skipPrepare: true });
    expect(restarted.failure).toBeNull();
    expect(restarted.feiMs).toBe(0);
    expect(restarted.completed).toBe(0);
    expect(restarted.status).toBe("countdown");
  });
});

describe("quotes", () => {
  it("keeps success and failure pools separate and non-empty", () => {
    expect(SUCCESS_QUOTES.length).toBeGreaterThan(5);
    expect(FAILURE_QUOTES.length).toBeGreaterThan(5);
    const s = new Set(SUCCESS_QUOTES.map((q) => q.text));
    for (const q of FAILURE_QUOTES) expect(s.has(q.text)).toBe(false);
  });

  it("are short and carry no invented attribution", () => {
    for (const q of [...SUCCESS_QUOTES, ...FAILURE_QUOTES]) {
      expect(q.text.length).toBeLessThanOrEqual(48);
      expect(q.source).toBeNull();
      expect(q.text).not.toMatch(/—/);
    }
  });

  it("shows every line once before any repeats, per kind", () => {
    for (const kind of ["success", "failure"] as const) {
      const n = QUOTES[kind].length;
      const first = Array.from({ length: n }, (_, i) => selectQuote(kind, "session-a", i).id);
      expect(new Set(first).size).toBe(n);
    }
  });

  it("never repeats a line back to back, even across passes", () => {
    for (const seed of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
      let prev = "";
      for (let i = 0; i < SUCCESS_QUOTES.length * 4; i++) {
        const id = selectQuote("success", seed, i).id;
        expect(id).not.toBe(prev);
        prev = id;
      }
    }
  });

  it("is deterministic for a session and differs between sessions", () => {
    expect(selectQuote("success", "x", 3)).toEqual(selectQuote("success", "x", 3));
    const a = Array.from({ length: 6 }, (_, i) => selectQuote("success", "x", i).id);
    const b = Array.from({ length: 6 }, (_, i) => selectQuote("success", "y", i).id);
    expect(a).not.toEqual(b);
  });

  it("selects from the matching pool", () => {
    const failureIds = new Set(FAILURE_QUOTES.map((q) => q.id));
    for (let i = 0; i < 20; i++) expect(failureIds.has(selectQuote("failure", "z", i).id)).toBe(true);
  });

  it("permutation is a permutation", () => {
    expect([...permutation(10, "p")].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe("failure copy", () => {
  it("names the mismatched positions for assistive technology", async () => {
    const { mismatchSentence } = await import("@/lib/game/feedback");
    expect(mismatchSentence([3])).toBe("Position 3 did not match.");
    expect(mismatchSentence([2, 5])).toBe("Positions 2 and 5 did not match.");
    expect(mismatchSentence([1, 2, 4])).toBe("Positions 1, 2 and 4 did not match.");
  });
});
