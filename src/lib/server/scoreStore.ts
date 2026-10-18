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
}

export interface ScoreStore {
  info: BackendInfo;
  /** Inserts unless this player already has a record for this date and division. */
  insert(record: ScoreRecord): Promise<"inserted" | "duplicate">;
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
    async insert(record) {
      if (records.some((r) => sameSlot(r, record))) return "duplicate";
      records.push(record);
      return "inserted";
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
      records = Array.isArray(list) ? (list as ScoreRecord[]) : [];
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
    insert(record) {
      const run = queue.then(async () => {
        const list = await load();
        if (list.some((r) => sameSlot(r, record))) return "duplicate" as const;
        const nextList = [...list, record];
        await save(nextList);
        records = nextList;
        return "inserted" as const;
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
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) return "supabase";
  if (env.LEADERBOARD_STORE === "memory") return "memory";
  if (env.LEADERBOARD_STORE === "file") return "file";
  if (env.VERCEL) return "serverless-memory";
  return "file";
}

const globalForStore = globalThis as unknown as { __synapseStore?: ScoreStore };

/** One store per server process, surviving dev-mode module reloads. */
export function getScoreStore(): ScoreStore {
  if (globalForStore.__synapseStore) return globalForStore.__synapseStore;
  const env = process.env;
  let store: ScoreStore;
  switch (selectStoreKind(env)) {
    case "supabase":
      store = createSupabaseStore(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);
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
