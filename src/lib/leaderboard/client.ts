/**
 * Browser-side leaderboard service.
 *
 * The UI talks to this interface only, never to fetch directly, so a different
 * backend (a hosted API, Supabase from the browser with anonymous auth) can be
 * swapped in without touching a component.
 */
import type { Division } from "@/lib/game/rules";
import type {
  LeaderboardPeriod,
  LeaderboardSnapshot,
  SubmitRequest,
  SubmitResponse,
} from "./types";

export interface BoardQuery {
  period: LeaderboardPeriod;
  dateKey: string | null;
  division: Division;
  playerId: string | null;
}

export interface LeaderboardService {
  fetchBoard(query: BoardQuery, signal?: AbortSignal): Promise<LeaderboardSnapshot>;
  submit(request: SubmitRequest): Promise<SubmitResponse>;
}

export class LeaderboardUnavailableError extends Error {
  constructor(message = "The leaderboard could not be reached.") {
    super(message);
    this.name = "LeaderboardUnavailableError";
  }
}

const TIMEOUT_MS = 8000;

function withTimeout(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export function createHttpLeaderboardService(base = "/api/leaderboard"): LeaderboardService {
  return {
    async fetchBoard(q, signal) {
      const params = new URLSearchParams({ period: q.period, division: q.division });
      if (q.dateKey) params.set("date", q.dateKey);
      if (q.playerId) params.set("player", q.playerId);
      let res: Response;
      try {
        res = await fetch(`${base}?${params}`, { signal: withTimeout(signal), cache: "no-store" });
      } catch (err) {
        if (signal?.aborted) throw err;
        throw new LeaderboardUnavailableError();
      }
      if (!res.ok) throw new LeaderboardUnavailableError();
      return (await res.json()) as LeaderboardSnapshot;
    },
    async submit(request) {
      let res: Response;
      try {
        res = await fetch(`${base}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
          signal: withTimeout(),
        });
      } catch {
        throw new LeaderboardUnavailableError();
      }
      if (res.status >= 500 || res.status === 404) throw new LeaderboardUnavailableError();
      try {
        return (await res.json()) as SubmitResponse;
      } catch {
        throw new LeaderboardUnavailableError();
      }
    },
  };
}

export const leaderboardService: LeaderboardService = createHttpLeaderboardService();
