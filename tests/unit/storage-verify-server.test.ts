import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildChallenge, dailyConfig } from "@/lib/game/engine";
import { replayRun } from "@/lib/game/verify";
import { TOKEN_IDS, type TokenId } from "@/lib/game/tokens";
import {
  STORAGE_KEY,
  aggregateStats,
  defaultData,
  loadData,
  recordRun,
  type RunSummary,
} from "@/lib/storage/schema";
import { handleQuery, handleSubmit } from "@/lib/server/leaderboard";
import { createRateLimiter } from "@/lib/server/rateLimit";
import { createFileStore, createMemoryStore } from "@/lib/server/scoreStore";
import { createSupabaseStore } from "@/lib/server/supabaseStore";

const ID = "3f2b8c1e-6a0d-4e7b-9c55-1d2e3f4a5b6c";
const ID2 = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const TODAY = "2026-10-13";
const NOW = new Date("2026-10-13T15:00:00Z");

function correctAnswers(dateKey: string, count: number, division: "standard" | "spoken" = "standard"): TokenId[][] {
  const config = dailyConfig(dateKey, division);
  return Array.from({ length: count }, (_, i) => [...buildChallenge(config, i).sequence]);
}

function wrong(seq: TokenId[]): TokenId[] {
  const out = [...seq];
  out[0] = TOKEN_IDS.find((t) => t !== seq[0])!;
  return out;
}

describe("local storage recovery", () => {
  const makeId = () => ID;

  it("starts clean with no data", () => {
    const d = loadData(null, makeId, TODAY);
    expect(d.playerId).toBe(ID);
    expect(d.settings.sound).toBe(false);
    expect(d.settings.presentation).toBe("visual");
  });

  it("survives invalid JSON", () => {
    expect(loadData("{not json", makeId, TODAY)).toEqual(defaultData(ID));
  });

  it("keeps valid fields and repairs broken ones individually", () => {
    const raw = JSON.stringify({
      playerId: "not-a-uuid",
      settings: { sound: "yes", theme: "dark", displayName: "<script>", motion: "reduce" },
      stats: {
        "practice:standard:foundation": { bestFeiMs: 9000, bestStreak: 2, bestLength: 3, runs: 1, completedChallenges: 2 },
        "daily:standard": { bestFeiMs: -1 },
      },
      recent: [{ junk: true }],
      daily: { [`${TODAY}:standard`]: { status: "weird" } },
    });
    const d = loadData(raw, makeId, TODAY);
    expect(d.playerId).toBe(ID);
    expect(d.settings).toMatchObject({ sound: false, theme: "dark", motion: "reduce", displayName: "" });
    expect(Object.keys(d.stats)).toEqual(["practice:standard:foundation"]);
    expect(d.recent).toEqual([]);
    expect(d.daily).toEqual({});
  });

  it("drops stored answers containing unknown tokens", () => {
    const entry = {
      status: "finished", answers: [["circle", "pentagon", "star"]], feiMs: 0, completed: 0,
      maxLength: 0, bestStreak: 0, endReason: "mismatch", posted: "no", rank: null,
    };
    const raw = JSON.stringify({ playerId: ID, daily: { [`${TODAY}:standard`]: entry } });
    expect(loadData(raw, makeId, TODAY).daily).toEqual({});
  });

  it("prunes old daily progress", () => {
    const entry = {
      status: "finished", answers: [], feiMs: 0, completed: 0, maxLength: 0, bestStreak: 0,
      endReason: "mismatch", posted: "no", rank: null,
    };
    const raw = JSON.stringify({ playerId: ID, daily: { "2026-01-01:standard": entry, [`${TODAY}:standard`]: entry } });
    expect(Object.keys(loadData(raw, makeId, TODAY).daily)).toEqual([`${TODAY}:standard`]);
  });

  it("uses a versioned key", () => {
    expect(STORAGE_KEY).toBe("synapse:v1");
  });
});

describe("personal records", () => {
  const practice: RunSummary = {
    mode: { kind: "practice", division: "standard", level: "foundation", customSeed: null },
    feiMs: 9000, completed: 2, maxLength: 3, bestStreak: 2, endReason: "mismatch", answers: [], endedAt: 1,
  };

  it("reports a first run as a best with no previous best", () => {
    const out = recordRun(defaultData(ID), practice);
    expect(out.previousBestMs).toBeNull();
    expect(out.isPersonalBest).toBe(true);
    expect(out.data.stats["practice:standard:foundation"]).toEqual({
      bestFeiMs: 9000, bestStreak: 2, bestLength: 3, runs: 1, completedChallenges: 2,
    });
  });

  it("only beats a best with a strictly higher FEI", () => {
    const first = recordRun(defaultData(ID), practice).data;
    const equal = recordRun(first, { ...practice, endedAt: 2 });
    expect(equal.isPersonalBest).toBe(false);
    expect(equal.previousBestMs).toBe(9000);
    const better = recordRun(first, { ...practice, feiMs: 13500, endedAt: 3 });
    expect(better.isPersonalBest).toBe(true);
  });

  it("never calls a zero run a best", () => {
    expect(recordRun(defaultData(ID), { ...practice, feiMs: 0, completed: 0 }).isPersonalBest).toBe(false);
  });

  it("keeps practice and ranked records apart", () => {
    let d = recordRun(defaultData(ID), practice).data;
    const daily: RunSummary = { ...practice, mode: { kind: "daily", dateKey: TODAY, division: "standard" }, feiMs: 4500, endedAt: 5 };
    const out = recordRun(d, daily);
    d = out.data;
    expect(out.previousBestMs).toBeNull();
    expect(d.stats["daily:standard"]?.bestFeiMs).toBe(4500);
    expect(d.stats["practice:standard:foundation"]?.bestFeiMs).toBe(9000);
    expect(d.daily[`${TODAY}:standard`]?.status).toBe("finished");
    expect(aggregateStats(d)).toMatchObject({ practiceSessions: 1, dailyRuns: 1, completedChallenges: 4 });
  });
});

describe("run replay verification", () => {
  const config = dailyConfig(TODAY, "standard");

  it("scores a run of correct answers", () => {
    const r = replayRun(config, correctAnswers(TODAY, 4));
    expect(r).toEqual({ valid: true, completed: 4, feiMs: 3 * 1500 * 2 + 4 * 1500 * 2, maxLength: 4, endedOnMismatch: false });
  });

  it("accepts a run that ends on a mismatch", () => {
    const answers = correctAnswers(TODAY, 3);
    answers[2] = wrong(answers[2]!);
    expect(replayRun(config, answers)).toMatchObject({ valid: true, completed: 2, feiMs: 9000, endedOnMismatch: true });
  });

  it("rejects answers after a mismatch, wrong lengths and unknown tokens", () => {
    const answers = correctAnswers(TODAY, 3);
    answers[0] = wrong(answers[0]!);
    expect(replayRun(config, answers).valid).toBe(false);
    expect(replayRun(config, [["circle"]]).valid).toBe(false);
    expect(replayRun(config, [["circle", "circle", "pentagon"]]).valid).toBe(false);
  });

  it("rejects a run claimed for another division's sequences", () => {
    const r = replayRun(dailyConfig(TODAY, "spoken"), correctAnswers(TODAY, 3, "standard"));
    expect(r.valid === false || r.completed < 3).toBe(true);
  });
});

describe("leaderboard handlers", () => {
  const deps = () => ({ store: createMemoryStore(), now: NOW });

  it("computes the score server-side and ignores any claimed score", async () => {
    const d = deps();
    const res = await handleSubmit(
      { dateKey: TODAY, division: "standard", playerId: ID, displayName: "Ada", answers: correctAnswers(TODAY, 2), feiMs: 999_999 },
      d,
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "accepted", entry: { feiMs: 9000, completed: 2, rank: 1, isPlayer: true } });
  });

  it("allows one record per player per day and division", async () => {
    const d = deps();
    const body = { dateKey: TODAY, division: "standard", playerId: ID, displayName: "Ada", answers: correctAnswers(TODAY, 1) };
    await handleSubmit(body, d);
    const again = await handleSubmit({ ...body, answers: correctAnswers(TODAY, 5) }, d);
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ status: "duplicate", entry: { feiMs: 4500 } });
    const spoken = await handleSubmit({ ...body, division: "spoken", answers: correctAnswers(TODAY, 1, "spoken") }, d);
    expect(spoken.status).toBe(201);
  });

  it("rejects malformed bodies, bad names, closed dates and unverifiable runs", async () => {
    const d = deps();
    const base = { dateKey: TODAY, division: "standard", playerId: ID, displayName: "Ada", answers: correctAnswers(TODAY, 1) };
    expect((await handleSubmit(null, d)).status).toBe(400);
    expect((await handleSubmit({ ...base, displayName: "x" }, d)).status).toBe(400);
    expect((await handleSubmit({ ...base, displayName: "<b>hi</b>" }, d)).status).toBe(400);
    expect((await handleSubmit({ ...base, playerId: "abc" }, d)).status).toBe(400);
    expect((await handleSubmit({ ...base, division: "turbo" }, d)).status).toBe(400);
    expect((await handleSubmit({ ...base, dateKey: "2026-10-01", answers: correctAnswers("2026-10-01", 1) }, d)).status).toBe(422);
    expect((await handleSubmit({ ...base, answers: [["circle"]] }, d)).status).toBe(422);
  });

  it("ranks by FEI, then completions, then who posted first, and finds the player outside the top", async () => {
    const store = createMemoryStore();
    for (let i = 0; i < 30; i++) {
      const id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
      await handleSubmit(
        { dateKey: TODAY, division: "standard", playerId: id, displayName: `P${i}`, answers: correctAnswers(TODAY, (i % 6) + 2) },
        { store, now: new Date(NOW.getTime() + i) },
      );
    }
    await handleSubmit(
      { dateKey: TODAY, division: "standard", playerId: ID, displayName: "Last", answers: correctAnswers(TODAY, 1) },
      { store, now: NOW },
    );
    const res = await handleQuery({ period: "daily", date: TODAY, division: "standard", playerId: ID }, { store, now: NOW });
    const body = res.body as Exclude<typeof res.body, { error: string }>;
    expect(body.entries).toHaveLength(25);
    expect(body.total).toBe(31);
    const fei = body.entries.map((e) => e.feiMs);
    expect([...fei].sort((a, b) => b - a)).toEqual(fei);
    expect(body.entries[0]!.displayName).toBe("P5"); // highest score, posted first among equals
    expect(body.player).toMatchObject({ rank: 31, displayName: "Last", isPlayer: true });
    expect(body.backend.isPreview).toBe(true);
  });

  it("all-time shows each player's best day once", async () => {
    const store = createMemoryStore();
    const submit = (dateKey: string, n: number, at: string) =>
      handleSubmit({ dateKey, division: "standard", playerId: ID, displayName: "Ada", answers: correctAnswers(dateKey, n) }, { store, now: new Date(at) });
    await submit("2026-10-12", 2, "2026-10-12T12:00:00Z");
    await submit("2026-10-13", 4, "2026-10-13T12:00:00Z");
    const res = await handleQuery({ period: "all-time", date: null, division: "standard", playerId: null }, { store, now: NOW });
    const body = res.body as Exclude<typeof res.body, { error: string }>;
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]).toMatchObject({ dateKey: "2026-10-13", completed: 4, isPlayer: false });
  });

  it("never returns player ids", async () => {
    const d = deps();
    await handleSubmit({ dateKey: TODAY, division: "standard", playerId: ID2, displayName: "Bo", answers: correctAnswers(TODAY, 1) }, d);
    const res = await handleQuery({ period: "daily", date: TODAY, division: "standard", playerId: null }, d);
    expect(JSON.stringify(res.body)).not.toContain(ID2);
  });
});

describe("score stores", () => {
  it("file store persists, refuses duplicates and survives a corrupt file", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "synapse-"));
    const file = path.join(dir, "scores.json");
    const rec = { dateKey: TODAY, division: "standard" as const, playerId: ID, displayName: "Ada", feiMs: 4500, completed: 1, maxLength: 3, submittedAt: 1 };
    const a = createFileStore(file);
    const results = await Promise.all([a.insert(rec), a.insert(rec)]);
    expect(results.sort()).toEqual(["duplicate", "inserted"]);
    expect(JSON.parse(readFileSync(file, "utf8")).records).toHaveLength(1);
    expect(await createFileStore(file).listDaily(TODAY, "standard")).toHaveLength(1);

    writeFileSync(file, "{broken");
    const c = createFileStore(file);
    expect(await c.listDaily(TODAY, "standard")).toEqual([]);
  });

  it("supabase store shapes requests and maps a unique violation to duplicate", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return new Response(null, { status: 409 });
      return Response.json([
        { date_key: TODAY, division: "standard", player_id: ID, display_name: "Ada", fei_ms: 4500, completed: 1, max_length: 3, submitted_at: "2026-10-13T12:00:00Z" },
      ]);
    });
    const store = createSupabaseStore("https://x.supabase.co/", "service-key", fetchMock as unknown as typeof fetch);
    const rec = { dateKey: TODAY, division: "standard" as const, playerId: ID, displayName: "Ada", feiMs: 4500, completed: 1, maxLength: 3, submittedAt: 1 };
    expect(await store.insert(rec)).toBe("duplicate");
    const [postUrl, postInit] = fetchMock.mock.calls[0]!;
    expect(postUrl).toBe("https://x.supabase.co/rest/v1/daily_scores");
    expect(JSON.parse(String(postInit!.body))).toMatchObject({ date_key: TODAY, fei_ms: 4500, player_id: ID });
    const list = await store.listDaily(TODAY, "standard");
    expect(list[0]).toMatchObject({ playerId: ID, feiMs: 4500, submittedAt: Date.parse("2026-10-13T12:00:00Z") });
    expect(String(fetchMock.mock.calls[1]![0])).toContain("date_key=eq.2026-10-13&division=eq.standard");
    expect(store.info.isPreview).toBe(false);
  });

  it("rate limiter allows up to the limit per window", () => {
    const rl = createRateLimiter(2, 1000);
    expect([rl.hit("a", 0), rl.hit("a", 1), rl.hit("a", 2), rl.hit("b", 2), rl.hit("a", 1001)]).toEqual([
      true, true, false, true, true,
    ]);
  });
});
