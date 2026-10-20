import { promises as fs } from "node:fs";
import path from "node:path";
import type { Division } from "@/lib/game/rules";
import type { BackendInfo } from "@/lib/leaderboard/types";
import { createSupabaseStore } from "./supabaseStore";

/**
 * Persistence behind the leaderboard routes.
 *
 * Three implementations share one interface:
 *  - file: a JSON file on the machine running Next.js (the default preview)
 *  - memory: process memory, lost on restart (used by the browser tests)
 *  - supabase: Postgres through PostgREST, chosen when credentials are set
 *
 * Only the Supabase store is a real shared ranking. The other two are labelled
 * as previews everywhere they surface in the UI.
 */

export interface ScoreRecord {
  dateKey: string;
  division: Division;
  playerId: string;
  displayName: string;
  feiMs: number;
  completed: number;
  maxLength: number;
  submittedAt: number;
  /** How many of the day's attempts have been counted for this record (1 or 2). */
  attempts: number;
}

export { MAX_DAILY_ATTEMPTS } from "@/lib/game/daily";

export type { SubmitOutcome } from "@/lib/leaderboard/types";
import type { SubmitOutcome } from "@/lib/leaderboard/types";

export interface SubmitResult {
  outcome: SubmitOutcome;
  /** The stored record after the submission. */
  record: ScoreRecord;
}

/**
 * The best-of-two rule, shared by every store (Supabase runs the same logic
 * in SQL, in submit_daily_score). `incoming.attempts` is the attempt number.
 *  - no record yet: insert it
 *  - attempt number not above the stored count: a resend, nothing changes
 *  - better score (FEI, then challenges completed): replace it
 *  - otherwise: keep the stored score, count the attempt, take the latest name
 */
export function applySubmission(existing: ScoreRecord | undefined, incoming: ScoreRecord): SubmitResult {
  if (!existing) return { outcome: "inserted", record: incoming };
  if (incoming.attempts <= existing.attempts) return { outcome: "unchanged", record: existing };
  const better =
    incoming.feiMs > existing.feiMs || (incoming.feiMs === existing.feiMs && incoming.completed > existing.completed);
  if (better) return { outcome: "improved", record: incoming };
  return {
    outcome: "kept",
    record: { ...existing, displayName: incoming.displayName, attempts: incoming.attempts },
  };
}

export interface ScoreStore {
  info: BackendInfo;
  /** Applies one verified attempt under the best-of-two rule. */
  submit(record: ScoreRecord): Promise<SubmitResult>;
  listDaily(dateKey: string, division: Division): Promise<ScoreRecord[]>;
  listAllTime(division: Division): Promise<ScoreRecord[]>;
}

export function compareRecords(a: ScoreRecord, b: ScoreRecord): number {
  return b.feiMs - a.feiMs || b.completed - a.completed || a.submittedAt - b.submittedAt;
}

function sameSlot(a: ScoreRecord, b: ScoreRecord): boolean {
  return a.dateKey === b.dateKey && a.division === b.division && a.playerId === b.playerId;
}

export const MEMORY_LABEL = "Preview server. Scores live in this server's memory and reset when it restarts.";
export const SERVERLESS_LABEL =
  "Preview deployment. Scores are held in temporary server memory, so they can reset at any time and may differ between visits.";

export function createMemoryStore(label: string = MEMORY_LABEL): ScoreStore {
  const records: ScoreRecord[] = [];
  return {
    info: {
      kind: "preview-memory",
      isPreview: true,
      label,
    },
    async submit(record) {
      const i = records.findIndex((r) => sameSlot(r, record));
      const result = applySubmission(i === -1 ? undefined : records[i], record);
      if (i === -1) records.push(result.record);
      else records[i] = result.record;
      return result;
    },
    async listDaily(dateKey, division) {
      return records.filter((r) => r.dateKey === dateKey && r.division === division).sort(compareRecords);
    },
    async listAllTime(division) {
      return records.filter((r) => r.division === division).sort(compareRecords);
    },
  };
}

export function createFileStore(file: string): ScoreStore {
  let records: ScoreRecord[] | null = null;
  // Serialise every mutation so concurrent submissions cannot interleave writes.
  let queue: Promise<unknown> = Promise.resolve();

  async function load(): Promise<ScoreRecord[]> {
    if (records) return records;
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(file, "utf8"));
      const list = (parsed as { records?: unknown }).records;
      // Files written before two attempts existed have no count: treat as one.
      records = Array.isArray(list) ? (list as ScoreRecord[]).map((r) => ({ ...r, attempts: r.attempts ?? 1 })) : [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        // Keep a corrupt file for inspection rather than overwriting it.
        await fs.rename(file, `${file}.corrupt-${Date.now()}`).catch(() => undefined);
      }
      records = [];
    }
    return records;
  }

  async function save(list: ScoreRecord[]): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify({ records: list }, null, 1));
    await fs.rename(tmp, file);
  }

  return {
    info: {
      kind: "preview-file",
      isPreview: true,
      label: "Preview server. Scores are saved on the machine running this app, not in a global ranking.",
    },
    submit(record) {
      const run = queue.then(async () => {
        const list = await load();
        const i = list.findIndex((r) => sameSlot(r, record));
        const result = applySubmission(i === -1 ? undefined : list[i], record);
        if (result.outcome === "unchanged") return result;
        const nextList = i === -1 ? [...list, result.record] : list.map((r, j) => (j === i ? result.record : r));
        await save(nextList);
        records = nextList;
        return result;
      });
      queue = run.catch(() => undefined);
      return run;
    },
    async listDaily(dateKey, division) {
      await queue;
      return (await load()).filter((r) => r.dateKey === dateKey && r.division === division).sort(compareRecords);
    },
    async listAllTime(division) {
      await queue;
      return (await load()).filter((r) => r.division === division).sort(compareRecords);
    },
  };
}

export type StoreKind = "supabase" | "memory" | "serverless-memory" | "file";

/**
 * Which store to use, from the environment alone.
 *
 * Serverless hosts such as Vercel have a read-only, per-instance filesystem,
 * so the file store cannot work there. Without Supabase credentials a Vercel
 * deployment falls back to memory, labelled as temporary.
 */
export function selectStoreKind(env: Record<string, string | undefined>): StoreKind {
  // An explicit LEADERBOARD_STORE always wins, so local test runs can never
  // write to a real Supabase project that happens to be configured in .env.local.
  if (env.LEADERBOARD_STORE === "memory") return "memory";
  if (env.LEADERBOARD_STORE === "file") return "file";
  if (env.SUPABASE_URL && supabaseKey(env)) return "supabase";
  if (env.VERCEL) return "serverless-memory";
  return "file";
}

/** SUPABASE_SECRET_KEY (new key format) or SUPABASE_SERVICE_ROLE_KEY (either format). */
export function supabaseKey(env: Record<string, string | undefined>): string | undefined {
  return env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || undefined;
}

const globalForStore = globalThis as unknown as { __synapseStore?: ScoreStore };

/** One store per server process, surviving dev-mode module reloads. */
export function getScoreStore(): ScoreStore {
  if (globalForStore.__synapseStore) return globalForStore.__synapseStore;
  const env = process.env;
  let store: ScoreStore;
  switch (selectStoreKind(env)) {
    case "supabase":
      store = createSupabaseStore(env.SUPABASE_URL!, supabaseKey(env)!);
      break;
    case "memory":
      store = createMemoryStore();
      break;
    case "serverless-memory":
      store = createMemoryStore(SERVERLESS_LABEL);
      break;
    case "file":
      store = createFileStore(path.join(process.cwd(), ".data", "scores.json"));
      break;
  }
  globalForStore.__synapseStore = store;
  return store;
}
