import { describe, expect, it } from "vitest";
import {
  acceptableDateKeys,
  dailySeed,
  formatCountdown,
  isValidDateKey,
  msUntilNextUtcDay,
  previousDateKey,
  utcDateKey,
} from "@/lib/game/daily";
import { createRng, hashString } from "@/lib/game/random";
import { SPOKEN_RULES, STANDARD_RULES, difficultyFor, isMaxDifficulty } from "@/lib/game/rules";
import {
  challengeContributionMs,
  describeFei,
  formatDelta,
  formatDuration,
  formatFei,
  totalFeiMs,
} from "@/lib/game/scoring";
import { generateSequence, reviewPositions, sequencesMatch } from "@/lib/game/sequence";
import { TOKEN_IDS } from "@/lib/game/tokens";

describe("difficulty schedule", () => {
  it("starts at three tokens for 1.5 s", () => {
    expect(difficultyFor(STANDARD_RULES, 0)).toEqual({ length: 3, durationMs: 1500 });
  });

  it("adds a token every two completions and drops 100 ms every four", () => {
    const table = [0, 1, 2, 3, 4, 7, 8].map((c) => difficultyFor(STANDARD_RULES, c));
    expect(table).toEqual([
      { length: 3, durationMs: 1500 },
      { length: 3, durationMs: 1500 },
      { length: 4, durationMs: 1500 },
      { length: 4, durationMs: 1500 },
      { length: 5, durationMs: 1400 },
      { length: 6, durationMs: 1400 },
      { length: 7, durationMs: 1300 },
    ]);
  });

  it("caps at twelve tokens and 600 ms and stays there", () => {
    expect(difficultyFor(STANDARD_RULES, 18).length).toBe(12);
    expect(difficultyFor(STANDARD_RULES, 36).durationMs).toBe(600);
    expect(difficultyFor(STANDARD_RULES, 500)).toEqual({ length: 12, durationMs: 600 });
    expect(isMaxDifficulty(STANDARD_RULES, 35)).toBe(false);
    expect(isMaxDifficulty(STANDARD_RULES, 36)).toBe(true);
  });

  it("is monotonic: never easier after more completions", () => {
    for (let c = 0; c < 60; c++) {
      const a = difficultyFor(STANDARD_RULES, c);
      const b = difficultyFor(STANDARD_RULES, c + 1);
      expect(b.length).toBeGreaterThanOrEqual(a.length);
      expect(b.durationMs).toBeLessThanOrEqual(a.durationMs);
    }
  });

  it("spoken division keeps a 1 s floor", () => {
    expect(difficultyFor(SPOKEN_RULES, 100).durationMs).toBe(1000);
    expect(difficultyFor(SPOKEN_RULES, 4)).toEqual(difficultyFor(STANDARD_RULES, 4));
  });
});

describe("FEI", () => {
  it("is length times duration per correct challenge", () => {
    expect(challengeContributionMs(5, 1400)).toBe(7000);
    expect(
      totalFeiMs([
        { length: 3, durationMs: 1500, correct: true },
        { length: 3, durationMs: 1500, correct: true },
        { length: 4, durationMs: 1500, correct: false },
      ]),
    ).toBe(9000);
  });

  it("formats as MM:SS.t and truncates rather than rounds", () => {
    expect(formatFei(0)).toBe("00:00.0");
    expect(formatFei(154_500)).toBe("02:34.5");
    expect(formatFei(4_499)).toBe("00:04.4");
    expect(formatFei(3_600_000)).toBe("60:00.0");
    expect(formatFei(-5)).toBe("00:00.0");
  });

  it("describes for assistive technology", () => {
    expect(describeFei(4500)).toBe("4.5 seconds");
    expect(describeFei(154_500)).toBe("2 minutes 34.5 seconds");
    expect(describeFei(60_000)).toBe("1 minute 0.0 seconds");
  });

  it("formats durations and deltas", () => {
    expect(formatDuration(1500)).toBe("1.5 s");
    expect(formatDelta(4500)).toBe("+4.5 s");
    expect(formatDelta(-1200)).toBe("−1.2 s");
    expect(formatDelta(0)).toBe("±0.0 s");
  });
});

describe("seeded randomness", () => {
  it("is reproducible and seed-sensitive", () => {
    const a = createRng("alpha");
    const b = createRng("alpha");
    const c = createRng("beta");
    const sa = Array.from({ length: 5 }, () => a.next());
    expect(sa).toEqual(Array.from({ length: 5 }, () => b.next()));
    expect(sa).not.toEqual(Array.from({ length: 5 }, () => c.next()));
    expect(hashString("a")).not.toBe(hashString("b"));
  });

  it("stays in range", () => {
    const rng = createRng("range");
    for (let i = 0; i < 2000; i++) {
      const n = rng.int(8);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(8);
    }
  });
});

describe("sequences", () => {
  it("are reproducible per seed and index", () => {
    expect(generateSequence("s", 3, 7)).toEqual(generateSequence("s", 3, 7));
    expect(generateSequence("s", 3, 7)).not.toEqual(generateSequence("s", 4, 7));
  });

  it("use only known tokens, at the requested length, never three in a row", () => {
    for (let i = 0; i < 300; i++) {
      const seq = generateSequence("bulk", i, 12);
      expect(seq).toHaveLength(12);
      for (const t of seq) expect(TOKEN_IDS).toContain(t);
      for (let j = 2; j < seq.length; j++) {
        expect(seq[j] === seq[j - 1] && seq[j] === seq[j - 2]).toBe(false);
      }
    }
  });

  it("do repeat tokens sometimes", () => {
    const withRepeat = Array.from({ length: 100 }, (_, i) => generateSequence("rep", i, 8)).filter(
      (s) => new Set(s).size < s.length,
    );
    expect(withRepeat.length).toBeGreaterThan(0);
  });

  it("match only on identical identity and order", () => {
    expect(sequencesMatch(["circle", "square"], ["circle", "square"])).toBe(true);
    expect(sequencesMatch(["circle", "square"], ["square", "circle"])).toBe(false);
    expect(sequencesMatch(["circle", "square"], ["circle"])).toBe(false);
    expect(sequencesMatch(["circle", "square"], ["circle", "square", "star"])).toBe(false);
    expect(sequencesMatch(["star", "star"], ["star", "star"])).toBe(true);
    expect(sequencesMatch(["star", "star"], ["star", "arc"])).toBe(false);
    expect(sequencesMatch([], [])).toBe(true);
  });

  it("review marks each position", () => {
    expect(reviewPositions(["circle", "square", "star"], ["circle", "star", "star"])).toEqual([
      { position: 1, expected: "circle", given: "circle", correct: true },
      { position: 2, expected: "square", given: "star", correct: false },
      { position: 3, expected: "star", given: "star", correct: true },
    ]);
  });
});

describe("daily challenge dates", () => {
  it("uses the UTC calendar day, not the local one", () => {
    // 23:30 in Toronto on 13 Oct is already 14 Oct in UTC.
    expect(utcDateKey(new Date("2026-10-14T03:30:00Z"))).toBe("2026-10-14");
    expect(utcDateKey(new Date("2026-10-13T23:59:59.999Z"))).toBe("2026-10-13");
    expect(utcDateKey(new Date("2026-10-14T00:00:00.000Z"))).toBe("2026-10-14");
  });

  it("changes seed exactly at the boundary", () => {
    const before = dailySeed(utcDateKey(new Date("2026-10-13T23:59:59.999Z")), "standard");
    const after = dailySeed(utcDateKey(new Date("2026-10-14T00:00:00.000Z")), "standard");
    expect(before).not.toBe(after);
    expect(generateSequence(before, 0, 12)).not.toEqual(generateSequence(after, 0, 12));
  });

  it("validates date keys, including leap days", () => {
    expect(isValidDateKey("2028-02-29")).toBe(true);
    expect(isValidDateKey("2026-02-29")).toBe(false);
    expect(isValidDateKey("2026-13-01")).toBe(false);
    expect(isValidDateKey("26-10-13")).toBe(false);
  });

  it("knows the previous day across month and year ends", () => {
    expect(previousDateKey("2026-03-01")).toBe("2026-02-28");
    expect(previousDateKey("2027-01-01")).toBe("2026-12-31");
  });

  it("counts down to midnight UTC", () => {
    expect(msUntilNextUtcDay(new Date("2026-10-13T23:00:00Z"))).toBe(3_600_000);
    expect(formatCountdown(3_600_000)).toBe("1 h 00 min");
    expect(formatCountdown(59_000)).toBe("1 min");
  });

  it("accepts yesterday's run only during the first hour of the day", () => {
    expect(acceptableDateKeys(new Date("2026-10-14T00:20:00Z"))).toEqual(["2026-10-14", "2026-10-13"]);
    expect(acceptableDateKeys(new Date("2026-10-14T01:00:00Z"))).toEqual(["2026-10-14"]);
  });
});
