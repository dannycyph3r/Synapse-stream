/**
 * Difficulty schedule.
 *
 * Difficulty is a pure function of how many challenges have been completed in
 * the run. It never depends on time, randomness or the player's speed, which
 * is what keeps ranked scores comparable between players.
 */

export type Division = "standard" | "spoken";

export interface Ruleset {
  division: Division;
  initialLength: number;
  maxLength: number;
  /** Sequence length grows by one after this many completed challenges. */
  lengthEvery: number;
  initialDurationMs: number;
  minDurationMs: number;
  /** Presentation duration drops after this many completed challenges. */
  durationEvery: number;
  durationStepMs: number;
}

/** The brief's schedule, used by every visual run. */
export const STANDARD_RULES: Ruleset = {
  division: "standard",
  initialLength: 3,
  maxLength: 12,
  lengthEvery: 2,
  initialDurationMs: 1500,
  minDurationMs: 600,
  durationEvery: 4,
  durationStepMs: 100,
};

/**
 * Spoken presentation. Identical except for the duration floor: a spoken
 * token name needs roughly 0.6 to 0.8 seconds to say, so 600 ms would cut
 * words off. Because the conditions differ, spoken runs are ranked and
 * recorded in their own division and are never mixed with visual runs.
 */
export const SPOKEN_RULES: Ruleset = {
  ...STANDARD_RULES,
  division: "spoken",
  minDurationMs: 1000,
};

export const RULESETS: Record<Division, Ruleset> = {
  standard: STANDARD_RULES,
  spoken: SPOKEN_RULES,
};

export const DIVISIONS: readonly Division[] = ["standard", "spoken"];

export function isDivision(value: unknown): value is Division {
  return value === "standard" || value === "spoken";
}

export interface Difficulty {
  length: number;
  durationMs: number;
}

/** Difficulty of the next challenge after `completed` successful challenges. */
export function difficultyFor(rules: Ruleset, completed: number): Difficulty {
  const done = Math.max(0, Math.floor(completed));
  const length = Math.min(
    rules.maxLength,
    rules.initialLength + Math.floor(done / rules.lengthEvery),
  );
  const durationMs = Math.max(
    rules.minDurationMs,
    rules.initialDurationMs - Math.floor(done / rules.durationEvery) * rules.durationStepMs,
  );
  return { length, durationMs };
}

export function isMaxDifficulty(rules: Ruleset, completed: number): boolean {
  const d = difficultyFor(rules, completed);
  return d.length === rules.maxLength && d.durationMs === rules.minDurationMs;
}

/**
 * Practice runs may start further along the same schedule. The offset is the
 * number of completed challenges the run pretends to have behind it, so a
 * practice run follows exactly the curve a ranked run would from that point.
 */
export type PracticeLevelId = "foundation" | "extended" | "deep";

export interface PracticeLevel {
  id: PracticeLevelId;
  label: string;
  offset: number;
}

export const PRACTICE_LEVELS: readonly PracticeLevel[] = [
  { id: "foundation", label: "Foundation", offset: 0 },
  { id: "extended", label: "Extended", offset: 6 },
  { id: "deep", label: "Deep", offset: 12 },
];

export function practiceLevel(id: PracticeLevelId): PracticeLevel {
  return PRACTICE_LEVELS.find((l) => l.id === id) ?? PRACTICE_LEVELS[0]!;
}

export function isPracticeLevelId(value: unknown): value is PracticeLevelId {
  return PRACTICE_LEVELS.some((l) => l.id === value);
}
