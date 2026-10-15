/**
 * Local persistence: settings, personal records and daily progress.
 *
 * Everything here stays in the browser. Data is validated field by field on
 * load, so a corrupt, truncated or outdated record loses only the part that
 * is broken and never stops the game from starting.
 */
import { z } from "zod";
import { categoryOf, type EndReason, type RunMode } from "@/lib/game/engine";
import { isTokenId, type TokenId } from "@/lib/game/tokens";

export const STORAGE_KEY = "synapse:v1";
/** Key used before the product was renamed; read once and migrated. */
export const LEGACY_STORAGE_KEY = "synapse-stream:v1";
export const RECENT_LIMIT = 12;
/** Daily progress older than this is pruned on load. */
export const DAILY_RETENTION_DAYS = 21;

export const DISPLAY_NAME_PATTERN = /^[A-Za-z0-9 ._-]{2,20}$/;

const SettingsSchema = z.object({
  sound: z.boolean().catch(false),
  motion: z.enum(["system", "reduce", "allow"]).catch("system"),
  theme: z.enum(["system", "light", "dark"]).catch("system"),
  presentation: z.enum(["visual", "spoken"]).catch("visual"),
  practiceLevel: z.enum(["foundation", "extended", "deep"]).catch("foundation"),
  displayName: z
    .string()
    .catch("")
    .transform((s) => (DISPLAY_NAME_PATTERN.test(s.trim()) ? s.trim() : "")),
  rulesSeen: z.boolean().catch(false),
});
export type Settings = z.infer<typeof SettingsSchema>;

const CategoryStatsSchema = z.object({
  bestFeiMs: z.number().int().nonnegative(),
  bestStreak: z.number().int().nonnegative(),
  bestLength: z.number().int().nonnegative(),
  runs: z.number().int().nonnegative(),
  completedChallenges: z.number().int().nonnegative(),
});
export type CategoryStats = z.infer<typeof CategoryStatsSchema>;

const EndReasonSchema = z.enum(["mismatch", "exited", "interrupted"]);

const RecentResultSchema = z.object({
  id: z.string(),
  category: z.string(),
  kind: z.enum(["daily", "practice"]),
  dateKey: z.string().nullable(),
  feiMs: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  maxLength: z.number().int().nonnegative(),
  endReason: EndReasonSchema,
  endedAt: z.number(),
});
export type RecentResult = z.infer<typeof RecentResultSchema>;

const AnswersSchema = z.array(z.array(z.string().refine(isTokenId)));

const DailyEntrySchema = z.object({
  status: z.enum(["in-progress", "finished"]),
  answers: AnswersSchema,
  feiMs: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  maxLength: z.number().int().nonnegative(),
  bestStreak: z.number().int().nonnegative(),
  endReason: EndReasonSchema.nullable(),
  posted: z.enum(["no", "posted", "duplicate"]),
  rank: z.number().int().positive().nullable(),
});
export type DailyEntry = z.infer<typeof DailyEntrySchema>;

export interface StoredData {
  version: 1;
  playerId: string;
  settings: Settings;
  stats: Record<string, CategoryStats>;
  recent: RecentResult[];
  daily: Record<string, DailyEntry>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPlayerId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function defaultData(playerId: string): StoredData {
  return {
    version: 1,
    playerId,
    settings: SettingsSchema.parse({}),
    stats: {},
    recent: [],
    daily: {},
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function filterRecord<T>(value: unknown, schema: z.ZodType<T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(asRecord(value))) {
    const parsed = schema.safeParse(v);
    if (parsed.success) out[k] = parsed.data;
  }
  return out;
}

export function dailyKey(dateKey: string, division: string): string {
  return `${dateKey}:${division}`;
}

/**
 * Parse whatever was in storage. Never throws. `makeId` supplies a new player
 * id when none is stored or the stored one is malformed.
 */
export function loadData(raw: string | null, makeId: () => string, today: string): StoredData {
  let parsed: unknown = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  const obj = asRecord(parsed);
  const playerId = isPlayerId(obj.playerId) ? obj.playerId : makeId();
  const data = defaultData(playerId);

  data.settings = SettingsSchema.parse(asRecord(obj.settings));
  data.stats = filterRecord(obj.stats, CategoryStatsSchema);
  data.recent = (Array.isArray(obj.recent) ? obj.recent : [])
    .map((r) => RecentResultSchema.safeParse(r))
    .filter((r) => r.success)
    .map((r) => r.data)
    .slice(0, RECENT_LIMIT);

  const cutoff = Date.parse(`${today}T00:00:00Z`) - DAILY_RETENTION_DAYS * 86400000;
  const daily = filterRecord(obj.daily, DailyEntrySchema);
  for (const key of Object.keys(daily)) {
    const time = Date.parse(`${key.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(time) || time < cutoff) delete daily[key];
  }
  data.daily = daily;
  return data;
}

export interface RunSummary {
  mode: RunMode;
  feiMs: number;
  completed: number;
  maxLength: number;
  bestStreak: number;
  endReason: EndReason;
  answers: TokenId[][];
  endedAt: number;
}

export interface RecordOutcome {
  data: StoredData;
  /** Best FEI in this category before the run, or null for a first run. */
  previousBestMs: number | null;
  isPersonalBest: boolean;
}

const EMPTY_STATS: CategoryStats = {
  bestFeiMs: 0,
  bestStreak: 0,
  bestLength: 0,
  runs: 0,
  completedChallenges: 0,
};

/** Fold a finished run into the stored records. Pure. */
export function recordRun(data: StoredData, run: RunSummary): RecordOutcome {
  const category = categoryOf(run.mode);
  const prev = data.stats[category];
  const base = prev ?? EMPTY_STATS;
  const previousBestMs = prev && prev.runs > 0 ? prev.bestFeiMs : null;
  const isPersonalBest = run.feiMs > 0 && run.feiMs > (previousBestMs ?? 0);

  const stats: CategoryStats = {
    bestFeiMs: Math.max(base.bestFeiMs, run.feiMs),
    bestStreak: Math.max(base.bestStreak, run.bestStreak),
    bestLength: Math.max(base.bestLength, run.maxLength),
    runs: base.runs + 1,
    completedChallenges: base.completedChallenges + run.completed,
  };

  const recent: RecentResult = {
    id: `${run.endedAt.toString(36)}-${category}`,
    category,
    kind: run.mode.kind,
    dateKey: run.mode.kind === "daily" ? run.mode.dateKey : null,
    feiMs: run.feiMs,
    completed: run.completed,
    maxLength: run.maxLength,
    endReason: run.endReason,
    endedAt: run.endedAt,
  };

  const next: StoredData = {
    ...data,
    stats: { ...data.stats, [category]: stats },
    recent: [recent, ...data.recent].slice(0, RECENT_LIMIT),
  };

  if (run.mode.kind === "daily") {
    const key = dailyKey(run.mode.dateKey, run.mode.division);
    const existing = data.daily[key];
    next.daily = {
      ...data.daily,
      [key]: {
        status: "finished",
        answers: run.answers,
        feiMs: run.feiMs,
        completed: run.completed,
        maxLength: run.maxLength,
        bestStreak: run.bestStreak,
        endReason: run.endReason,
        posted: existing?.posted ?? "no",
        rank: existing?.rank ?? null,
      },
    };
  }

  return { data: next, previousBestMs, isPersonalBest };
}

/** Totals across every category, for the statistics view. */
export function aggregateStats(data: StoredData) {
  let completedChallenges = 0;
  let practiceSessions = 0;
  let dailyRuns = 0;
  let bestStreak = 0;
  for (const [category, s] of Object.entries(data.stats)) {
    completedChallenges += s.completedChallenges;
    bestStreak = Math.max(bestStreak, s.bestStreak);
    if (category.startsWith("practice:")) practiceSessions += s.runs;
    else dailyRuns += s.runs;
  }
  return { completedChallenges, practiceSessions, dailyRuns, bestStreak };
}
