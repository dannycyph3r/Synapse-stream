/**
 * Leaderboard request handling, independent of Next.js so it can be tested
 * without a server. The route handlers in src/app/api are thin wrappers.
 */
import { z } from "zod";
import { acceptableDateKeys, isValidDateKey, utcDateKey } from "@/lib/game/daily";
import { dailyConfig } from "@/lib/game/engine";
import { isDivision, type Division } from "@/lib/game/rules";
import { MAX_REPLAY_CHALLENGES, replayRun } from "@/lib/game/verify";
import { DISPLAY_NAME_PATTERN, isPlayerId } from "@/lib/storage/schema";
import {
  LEADERBOARD_PAGE_SIZE,
  type LeaderboardEntry,
  type LeaderboardPeriod,
  type LeaderboardSnapshot,
  type SubmitResponse,
} from "@/lib/leaderboard/types";
import type { ScoreRecord, ScoreStore } from "./scoreStore";

export interface HandlerResult<T> {
  status: number;
  body: T;
}

const SubmitSchema = z.object({
  dateKey: z.string().refine(isValidDateKey, "invalid date"),
  division: z.string().refine(isDivision, "unknown division"),
  playerId: z.string().refine(isPlayerId, "invalid player id"),
  displayName: z
    .string()
    .transform((s) => s.trim().replace(/\s+/g, " "))
    .refine((s) => DISPLAY_NAME_PATTERN.test(s), "display name must be 2 to 20 letters, numbers, spaces, dots, dashes or underscores"),
  answers: z.array(z.array(z.string()).max(32)).min(1).max(MAX_REPLAY_CHALLENGES),
});

function toEntry(r: ScoreRecord, rank: number, playerId: string | null): LeaderboardEntry {
  return {
    rank,
    displayName: r.displayName,
    feiMs: r.feiMs,
    completed: r.completed,
    maxLength: r.maxLength,
    dateKey: r.dateKey,
    isPlayer: playerId !== null && r.playerId === playerId,
  };
}

/** Records arrive sorted. Rank is position; ties are broken by completed count, then by who posted first. */
function rankOf(records: ScoreRecord[], pred: (r: ScoreRecord) => boolean): number | null {
  const i = records.findIndex(pred);
  return i === -1 ? null : i + 1;
}

export async function handleSubmit(
  body: unknown,
  deps: { store: ScoreStore; now: Date },
): Promise<HandlerResult<SubmitResponse>> {
  const parsed = SubmitSchema.safeParse(body);
  if (!parsed.success) {
    const reason = parsed.error.issues[0]?.message ?? "invalid submission";
    return { status: 400, body: { status: "rejected", reason } };
  }
  const req = parsed.data;
  const division = req.division as Division;

  if (!acceptableDateKeys(deps.now).includes(req.dateKey)) {
    return { status: 422, body: { status: "rejected", reason: "that daily challenge is closed" } };
  }

  // The score is recomputed here from the answers; nothing the client claims is trusted.
  const replay = replayRun(dailyConfig(req.dateKey, division), req.answers);
  if (!replay.valid) {
    return { status: 422, body: { status: "rejected", reason: `run did not verify: ${replay.reason}` } };
  }

  const record: ScoreRecord = {
    dateKey: req.dateKey,
    division,
    playerId: req.playerId,
    displayName: req.displayName,
    feiMs: replay.feiMs,
    completed: replay.completed,
    maxLength: replay.maxLength,
    submittedAt: deps.now.getTime(),
  };

  const outcome = await deps.store.insert(record);
  const list = await deps.store.listDaily(req.dateKey, division);
  const mine = list.find((r) => r.playerId === req.playerId) ?? null;
  const rank = rankOf(list, (r) => r.playerId === req.playerId);
  const entry = mine && rank ? toEntry(mine, rank, req.playerId) : null;

  if (outcome === "duplicate") {
    return { status: 409, body: { status: "duplicate", entry, backend: deps.store.info } };
  }
  if (!entry) throw new Error("inserted record was not readable");
  return { status: 201, body: { status: "accepted", entry, backend: deps.store.info } };
}

export interface QueryParams {
  period: string | null;
  date: string | null;
  division: string | null;
  playerId: string | null;
}

export async function handleQuery(
  params: QueryParams,
  deps: { store: ScoreStore; now: Date },
): Promise<HandlerResult<LeaderboardSnapshot | { error: string }>> {
  const period: LeaderboardPeriod = params.period === "all-time" ? "all-time" : "daily";
  const division: Division = isDivision(params.division) ? params.division : "standard";
  const playerId = isPlayerId(params.playerId) ? params.playerId : null;
  const dateKey = params.date ?? utcDateKey(deps.now);
  if (period === "daily" && !isValidDateKey(dateKey)) {
    return { status: 400, body: { error: "invalid date" } };
  }

  let records: ScoreRecord[];
  if (period === "daily") {
    records = await deps.store.listDaily(dateKey, division);
  } else {
    // All-time lists each player's single best day, so one player cannot fill the board.
    const seen = new Set<string>();
    records = (await deps.store.listAllTime(division)).filter((r) => {
      if (seen.has(r.playerId)) return false;
      seen.add(r.playerId);
      return true;
    });
  }

  const entries = records.slice(0, LEADERBOARD_PAGE_SIZE).map((r, i) => toEntry(r, i + 1, playerId));
  let player: LeaderboardEntry | null = null;
  if (playerId) {
    const rank = rankOf(records, (r) => r.playerId === playerId);
    if (rank) player = toEntry(records[rank - 1]!, rank, playerId);
  }

  return {
    status: 200,
    body: {
      backend: deps.store.info,
      period,
      dateKey: period === "daily" ? dateKey : null,
      division,
      entries,
      player,
      total: records.length,
    },
  };
}
