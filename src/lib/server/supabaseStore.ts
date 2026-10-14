import type { Division } from "@/lib/game/rules";
import type { ScoreRecord, ScoreStore } from "./scoreStore";

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
}

const COLUMNS = "date_key,division,player_id,display_name,fei_ms,completed,max_length,submitted_at";
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
  };
}

export function createSupabaseStore(
  baseUrl: string,
  serviceKey: string,
  fetchImpl: typeof fetch = fetch,
): ScoreStore {
  const endpoint = `${baseUrl.replace(/\/$/, "")}/rest/v1/daily_scores`;
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  async function list(query: string): Promise<ScoreRecord[]> {
    const res = await fetchImpl(
      `${endpoint}?select=${COLUMNS}&${query}&order=${ORDER}&limit=${SUPABASE_READ_LIMIT}`,
      { headers, cache: "no-store" },
    );
    if (!res.ok) throw new Error(`Supabase read failed: ${res.status}`);
    return ((await res.json()) as Row[]).map(toRecord);
  }

  return {
    info: { kind: "supabase", isPreview: false, label: "Global daily ranking." },
    async insert(record) {
      const row: Omit<Row, "submitted_at"> = {
        date_key: record.dateKey,
        division: record.division,
        player_id: record.playerId,
        display_name: record.displayName,
        fei_ms: record.feiMs,
        completed: record.completed,
        max_length: record.maxLength,
      };
      const res = await fetchImpl(endpoint, {
        method: "POST",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify(row),
      });
      // 409 is PostgREST's answer to the unique (date_key, division, player_id) constraint.
      if (res.status === 409) return "duplicate";
      if (!res.ok) throw new Error(`Supabase insert failed: ${res.status}`);
      return "inserted";
    },
    listDaily(dateKey, division) {
      return list(`date_key=eq.${encodeURIComponent(dateKey)}&division=eq.${division}`);
    },
    listAllTime(division) {
      return list(`division=eq.${division}`);
    },
  };
}
