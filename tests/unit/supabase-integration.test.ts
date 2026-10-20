/**
 * End-to-end leaderboard check without a Supabase account.
 *
 * A small HTTP server stands in for Supabase's REST layer (PostgREST),
 * implementing only the requests SYNAPSE makes, and runs them as the
 * service_role against the real migration in PGlite. The real Supabase store
 * and request handlers talk to it over HTTP. This proves the SQL, the
 * constraints, the 409 duplicate mapping and the key headers work together.
 * It is a stand-in, not PostgREST itself.
 */
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildChallenge, dailyConfig } from "@/lib/game/engine";
import { handleQuery, handleSubmit } from "@/lib/server/leaderboard";
import { createSupabaseStore } from "@/lib/server/supabaseStore";
import type { LeaderboardSnapshot } from "@/lib/leaderboard/types";

const SECRET = "sb_secret_test_key";
const TODAY = "2026-10-20";
const NOW = new Date("2026-10-20T15:00:00Z");
const COLUMNS = new Set(["date_key", "division", "player_id", "display_name", "fei_ms", "completed", "max_length", "submitted_at"]);
const MIGRATION = ["0001_daily_scores.sql", "0002_daily_attempts.sql"]
  .map((f) => readFileSync(path.join(import.meta.dirname, "../../supabase/migrations", f), "utf8"))
  .join("\n");

let db: PGlite;
let server: Server;
let baseUrl: string;
const seenHeaders: Record<string, string | undefined>[] = [];

function answers(n: number, run = 1) {
  const config = dailyConfig(TODAY, "standard", run);
  return Array.from({ length: n }, (_, i) => [...buildChallenge(config, i).sequence]);
}

async function asService<T>(fn: () => Promise<T>): Promise<T> {
  await db.exec("set role service_role");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
  `);
  await db.exec(MIGRATION);

  server = createServer(async (req, res) => {
    seenHeaders.push({ apikey: req.headers.apikey as string, authorization: req.headers.authorization });
    if (req.headers.apikey !== SECRET || req.headers.authorization) {
      res.writeHead(401).end('{"message":"Invalid API key"}');
      return;
    }
    const url = new URL(req.url!, "http://x");
    if (url.pathname === "/rest/v1/rpc/submit_daily_score" && req.method === "POST") {
      // PostgREST calls the function with named arguments and returns its rows as JSON.
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const a = JSON.parse(raw) as Record<string, unknown>;
      const names = ["p_date_key", "p_division", "p_player_id", "p_display_name", "p_fei_ms", "p_completed", "p_max_length", "p_attempt"];
      try {
        const result = await asService(() =>
          db.query(`select * from public.submit_daily_score(${names.map((n, i) => `${n} => $${i + 1}`).join(", ")})`, names.map((n) => a[n])),
        );
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(result.rows));
      } catch (err) {
        res.writeHead(400).end(JSON.stringify({ code: (err as { code?: string }).code }));
      }
      return;
    }
    if (url.pathname !== "/rest/v1/daily_scores") {
      res.writeHead(404).end('{"code":"PGRST205"}');
      return;
    }
    try {
      if (req.method === "POST") {
        let raw = "";
        for await (const chunk of req) raw += chunk;
        const row = JSON.parse(raw) as Record<string, unknown>;
        const cols = Object.keys(row).filter((c) => COLUMNS.has(c));
        await asService(() =>
          db.query(
            `insert into public.daily_scores (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")})`,
            cols.map((c) => row[c]),
          ),
        );
        res.writeHead(201).end();
        return;
      }
      const select = (url.searchParams.get("select") ?? "").split(",").filter((c) => COLUMNS.has(c));
      const where: string[] = [];
      const params: unknown[] = [];
      for (const col of ["date_key", "division"]) {
        const v = url.searchParams.get(col);
        if (v?.startsWith("eq.")) {
          params.push(v.slice(3));
          where.push(`${col} = $${params.length}`);
        }
      }
      const order = (url.searchParams.get("order") ?? "")
        .split(",")
        .map((part) => {
          const [col, dir] = part.split(".");
          return COLUMNS.has(col!) && (dir === "asc" || dir === "desc") ? `${col} ${dir}` : null;
        })
        .filter(Boolean);
      const limit = Number(url.searchParams.get("limit") ?? 1000);
      const sql = `select ${select.map((c) => (c === "date_key" ? "to_char(date_key, 'YYYY-MM-DD') as date_key" : c)).join(",")}
        from public.daily_scores ${where.length ? `where ${where.join(" and ")}` : ""}
        ${order.length ? `order by ${order.join(",")}` : ""} limit ${Math.min(limit, 1000)}`;
      const result = await asService(() => db.query(sql, params));
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(result.rows));
    } catch (err) {
      const code = (err as { code?: string }).code;
      // PostgREST maps unique_violation to 409 and check_violation to 400.
      res.writeHead(code === "23505" ? 409 : code === "23514" ? 400 : 500).end(JSON.stringify({ code }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await db.close();
});

describe("leaderboard against Postgres through a REST stand-in", () => {
  it("accepts verified runs, keeps each player's best of two attempts and ranks players", async () => {
    const store = createSupabaseStore(baseUrl, SECRET);
    const deps = { store, now: NOW };
    const ada = "3f2b8c1e-6a0d-4e7b-9c55-1d2e3f4a5b6c";
    const bo = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

    const first = await handleSubmit({ dateKey: TODAY, division: "standard", playerId: ada, displayName: "Ada", answers: answers(3), attempt: 1 }, deps);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ status: "accepted", outcome: "inserted", entry: { rank: 1, feiMs: 3 * 1500 * 2 + 4 * 1500 } });

    const second = await handleSubmit({ dateKey: TODAY, division: "standard", playerId: bo, displayName: "Bo Lee", answers: answers(5), attempt: 1 }, deps);
    expect(second.body).toMatchObject({ status: "accepted", entry: { rank: 1 } });

    // Ada's resend of attempt 1 changes nothing.
    const resend = await handleSubmit({ dateKey: TODAY, division: "standard", playerId: ada, displayName: "Ada", answers: answers(6), attempt: 1 }, deps);
    expect(resend.body).toMatchObject({ outcome: "unchanged", entry: { rank: 2, completed: 3 } });

    // Bo's worse second attempt keeps the first.
    const boWorse = await handleSubmit({ dateKey: TODAY, division: "standard", playerId: bo, displayName: "Bo Lee", answers: answers(2, 2), attempt: 2 }, deps);
    expect(boWorse.body).toMatchObject({ outcome: "kept", attempts: 2, entry: { completed: 5 } });

    const board = await handleQuery({ period: "daily", date: TODAY, division: "standard", playerId: ada }, deps);
    const snap = board.body as LeaderboardSnapshot;
    expect(snap.backend).toMatchObject({ kind: "supabase", isPreview: false });
    expect(snap.entries.map((e) => [e.rank, e.displayName, e.isPlayer])).toEqual([
      [1, "Bo Lee", false],
      [2, "Ada", true],
    ]);
    expect(JSON.stringify(snap)).not.toContain(bo);

    // Ada's better second attempt takes first place.
    const adaBetter = await handleSubmit({ dateKey: TODAY, division: "standard", playerId: ada, displayName: "Ada", answers: answers(6, 2), attempt: 2 }, deps);
    expect(adaBetter.body).toMatchObject({ outcome: "improved", attempts: 2, entry: { rank: 1, completed: 6 } });
  });

  it("sends the new secret key only in the apikey header", () => {
    expect(seenHeaders.length).toBeGreaterThan(0);
    for (const h of seenHeaders) expect(h).toEqual({ apikey: SECRET, authorization: undefined });
  });

  it("surfaces a database outage as an error the route turns into 503", async () => {
    const store = createSupabaseStore("http://127.0.0.1:9", SECRET);
    await expect(store.listDaily(TODAY, "standard")).rejects.toThrow();
  });
});
