import type { Division } from "@/lib/game/rules";
import type { ScoreRecord, ScoreStore, SubmitOutcome } from "./scoreStore";

/**
 * Supabase (Postgres via PostgREST) store.
 *
 * Status: written against the schema in supabase/migrations and covered by a
 * unit test of its request shapes, but never run against a live project,
 * because no credentials exist in the environment it was built in.
 *
 * It uses the service role key, which bypasses Row Level Security, so it must
 * only ever run on the server. The route handlers are the only callers, and
 * the key is read from a non-public environment variable.
 */

interface Row {
  date_key: string;
  division: Division;
  player_id: string;
  display_name: string;
  fei_ms: number;
  completed: number;
  max_length: number;
  submitted_at: string;
  attempts?: number;
}

const COLUMNS = "date_key,division,player_id,display_name,fei_ms,completed,max_length,submitted_at,attempts";
const ORDER = "fei_ms.desc,completed.desc,submitted_at.asc";
/** Read cap per query. Past this, ranking should move into SQL (window functions). */
export const SUPABASE_READ_LIMIT = 1000;

function toRecord(row: Row): ScoreRecord {
  return {
    dateKey: row.date_key,
    division: row.division,
    playerId: row.player_id,
    displayName: row.display_name,
    feiMs: row.fei_ms,
    completed: row.completed,
    maxLength: row.max_length,
    submittedAt: Date.parse(row.submitted_at),
    attempts: row.attempts ?? 1,
  };
}

/** A paused or unreachable project must fail fast, not hold a request open. */
export const SUPABASE_TIMEOUT_MS = 8000;

export type SupabaseKeyKind = "secret" | "legacy-service-role" | "publishable" | "unknown";

/**
 * Supabase has two key generations. New secret keys (sb_secret_...) are not
 * JWTs and go only in the apikey header; sending one as a Bearer token is
 * rejected. Legacy service_role keys are JWTs and go in both headers.
 * Publishable keys are browser keys and cannot write to this table.
 */
export function supabaseKeyKind(key: string): SupabaseKeyKind {
  if (key.startsWith("sb_secret_")) return "secret";
  if (key.startsWith("sb_publishable_")) return "publishable";
  if (key.split(".").length === 3 && key.startsWith("eyJ")) return "legacy-service-role";
  return "unknown";
}

export function supabaseAuthHeaders(key: string): Record<string, string> {
  return supabaseKeyKind(key) === "legacy-service-role"
    ? { apikey: key, Authorization: `Bearer ${key}` }
    : { apikey: key };
}

export function createSupabaseStore(
  baseUrl: string,
  serviceKey: string,
  fetchImpl: typeof fetch = fetch,
): ScoreStore {
  const base = baseUrl.replace(/\/$/, "");
  const endpoint = `${base}/rest/v1/daily_scores`;
  const headers = { ...supabaseAuthHeaders(serviceKey), "Content-Type": "application/json" };

  async function list(query: string): Promise<ScoreRecord[]> {
    const res = await fetchImpl(
      `${endpoint}?select=${COLUMNS}&${query}&order=${ORDER}&limit=${SUPABASE_READ_LIMIT}`,
      { headers, cache: "no-store", signal: AbortSignal.timeout(SUPABASE_TIMEOUT_MS) },
    );
    if (!res.ok) throw new Error(`Supabase read failed: ${res.status}`);
    return ((await res.json()) as Row[]).map(toRecord);
  }

  return {
    info: { kind: "supabase", isPreview: false, label: "Global daily ranking." },
    // The best-of-two rule runs inside Postgres (submit_daily_score, from
    // migration 0002), so two quick requests cannot both "win".
    async submit(record) {
      const res = await fetchImpl(`${base}/rest/v1/rpc/submit_daily_score`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          p_date_key: record.dateKey,
          p_division: record.division,
          p_player_id: record.playerId,
          p_display_name: record.displayName,
          p_fei_ms: record.feiMs,
          p_completed: record.completed,
          p_max_length: record.maxLength,
          p_attempt: record.attempts,
        }),
        signal: AbortSignal.timeout(SUPABASE_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`Supabase submit failed: ${res.status}`);
      const rows = (await res.json()) as (Omit<Row, "date_key" | "division" | "player_id"> & { outcome: SubmitOutcome })[];
      const row = rows[0];
      if (!row) throw new Error("Supabase submit returned no row");
      return {
        outcome: row.outcome,
        record: toRecord({ ...row, date_key: record.dateKey, division: record.division, player_id: record.playerId }),
      };
    },
    listDaily(dateKey, division) {
      return list(`date_key=eq.${encodeURIComponent(dateKey)}&division=eq.${division}`);
    },
    listAllTime(division) {
      return list(`division=eq.${division}`);
    },
  };
}
