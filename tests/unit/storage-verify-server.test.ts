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
  attemptInProgress,
  attemptsLeft,
  bestAttempt,
  dailyDone,
  finishedAttempts,
  needsPost,
  newAttempt,
  defaultData,
  loadData,
  recordRun,
  type RunSummary,
} from "@/lib/storage/schema";
import { handleQuery, handleSubmit } from "@/lib/server/leaderboard";
import { createRateLimiter } from "@/lib/server/rateLimit";
import { SERVERLESS_LABEL, applySubmission, createFileStore, createMemoryStore, selectStoreKind } from "@/lib/server/scoreStore";
import { createSupabaseStore, supabaseAuthHeaders, supabaseKeyKind } from "@/lib/server/supabaseStore";

const ID = "3f2b8c1e-6a0d-4e7b-9c55-1d2e3f4a5b6c";
const ID2 = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const TODAY = "2026-10-13";
const NOW = new Date("2026-10-13T15:00:00Z");

function correctAnswers(dateKey: string, count: number, division: "standard" | "spoken" = "standard", run = 1): TokenId[][] {
  const config = dailyConfig(dateKey, division, run);
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
    const daily: RunSummary = { ...practice, mode: { kind: "daily", dateKey: TODAY, division: "standard", attempt: 1 }, feiMs: 4500, endedAt: 5 };
    const out = recordRun(d, daily);
    d = out.data;
    expect(out.previousBestMs).toBeNull();
    expect(d.stats["daily:standard"]?.bestFeiMs).toBe(4500);
    expect(d.stats["practice:standard:foundation"]?.bestFeiMs).toBe(9000);
    expect(d.daily[`${TODAY}:standard`]?.attempts.map((a) => a.status)).toEqual(["finished"]);
    expect(aggregateStats(d)).toMatchObject({ practiceSessions: 1, dailyRuns: 1, completedChallenges: 4 });
  });
});

describe("daily attempts on this device", () => {
  const daily = (attempt: number, feiMs: number, completed: number): RunSummary => ({
    mode: { kind: "daily", dateKey: TODAY, division: "standard", attempt },
    feiMs, completed, maxLength: 3, bestStreak: completed, endReason: "mismatch", answers: [], endedAt: attempt,
  });

  it("fills one slot per attempt and knows when the day is done", () => {
    let d = defaultData(ID);
    const key = `${TODAY}:standard`;
    expect(attemptsLeft(d.daily[key])).toBe(2);
    d = recordRun(d, daily(1, 9000, 2)).data;
    expect(attemptsLeft(d.daily[key])).toBe(1);
    expect(dailyDone(d.daily[key])).toBe(false);
    expect(needsPost(d.daily[key])).toBe(true);
    d = recordRun(d, daily(2, 4500, 1)).data;
    expect(d.daily[key]!.attempts.map((a) => a.feiMs)).toEqual([9000, 4500]);
    expect(dailyDone(d.daily[key])).toBe(true);
    expect(bestAttempt(d.daily[key])).toMatchObject({ run: 1, attempt: { feiMs: 9000 } });
  });

  it("picks the better attempt by FEI, then challenges completed", () => {
    let d = recordRun(defaultData(ID), daily(1, 4500, 1)).data;
    d = recordRun(d, daily(2, 4500, 2)).data;
    expect(bestAttempt(d.daily[`${TODAY}:standard`])?.run).toBe(2);
  });

  it("knows an attempt is in progress, and what still needs posting", () => {
    const entry = { attempts: [{ ...newAttempt(), status: "finished" as const }, newAttempt()], postedAttempts: 1, rank: 3 };
    expect(attemptInProgress(entry)).toBe(true);
    expect(dailyDone(entry)).toBe(false);
    expect(needsPost(entry)).toBe(false);
    expect(finishedAttempts(entry)).toHaveLength(1);
  });

  it("converts a day saved in the old single-attempt format", () => {
    const legacy = {
      status: "finished", answers: [["circle", "star", "arc"]], feiMs: 4500, completed: 1, maxLength: 3,
      bestStreak: 1, endReason: "mismatch", posted: "posted", rank: 7,
    };
    const raw = JSON.stringify({ playerId: ID, daily: { [`${TODAY}:standard`]: legacy } });
    const entry = loadData(raw, () => ID, TODAY).daily[`${TODAY}:standard`]!;
    expect(entry).toMatchObject({ postedAttempts: 1, rank: 7, attempts: [{ status: "finished", feiMs: 4500 }] });
    expect(attemptsLeft(entry)).toBe(1);
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

  it("keeps the better of two attempts, one record per player per day and division", async () => {
    const d = deps();
    const body = { dateKey: TODAY, division: "standard", playerId: ID, displayName: "Ada", answers: correctAnswers(TODAY, 1), attempt: 1 };
    const first = await handleSubmit(body, d);
    expect(first.body).toMatchObject({ status: "accepted", outcome: "inserted", attempts: 1, bestFeiMs: 4500 });

    // Attempt 2, played on its own sequences, is better: it replaces attempt 1.
    const better = await handleSubmit({ ...body, attempt: 2, answers: correctAnswers(TODAY, 3, "standard", 2) }, d);
    expect(better.status).toBe(200);
    expect(better.body).toMatchObject({ outcome: "improved", attempts: 2, entry: { completed: 3, rank: 1 } });

    // A resend of attempt 2, or a third attempt, cannot change anything.
    const resend = await handleSubmit({ ...body, attempt: 2, answers: correctAnswers(TODAY, 6, "standard", 2) }, d);
    expect(resend.body).toMatchObject({ outcome: "unchanged", entry: { completed: 3 } });
    expect((await handleSubmit({ ...body, attempt: 3 }, d)).status).toBe(400);
    expect((await handleSubmit({ ...body, attempt: 0 }, d)).status).toBe(400);

    const board = await handleQuery({ period: "daily", date: TODAY, division: "standard", playerId: ID }, d);
    expect((board.body as { entries: unknown[] }).entries).toHaveLength(1);

    const spoken = await handleSubmit({ ...body, division: "spoken", answers: correctAnswers(TODAY, 1, "spoken") }, d);
    expect(spoken.status).toBe(201);
  });

  it("keeps attempt 1 when attempt 2 is worse, but takes the newer name", async () => {
    const d = deps();
    const body = { dateKey: TODAY, division: "standard", playerId: ID, displayName: "Ada", answers: correctAnswers(TODAY, 4), attempt: 1 };
    await handleSubmit(body, d);
    const worse = await handleSubmit({ ...body, attempt: 2, displayName: "Ada L", answers: correctAnswers(TODAY, 1, "standard", 2) }, d);
    expect(worse.body).toMatchObject({ outcome: "kept", attempts: 2, entry: { completed: 4, displayName: "Ada L" } });
  });

  it("verifies each run on its own attempt's sequences", async () => {
    const d = deps();
    const body = { dateKey: TODAY, division: "standard", playerId: ID, displayName: "Ada", attempt: 2 };
    // Attempt 1's best run, posted after attempt 2 (it never reached the board), verifies with run: 1.
    const earlier = await handleSubmit({ ...body, run: 1, answers: correctAnswers(TODAY, 3) }, d);
    expect(earlier.body).toMatchObject({ outcome: "inserted", attempts: 2, entry: { completed: 3 } });
    // The same answers claimed for attempt 2's sequences do not verify.
    const d2 = deps();
    const wrongSeed = await handleSubmit({ ...body, run: 2, answers: correctAnswers(TODAY, 3) }, d2);
    expect(wrongSeed.status).toBe(422);
    // A run cannot come from an attempt that has not happened.
    expect((await handleSubmit({ ...body, attempt: 1, run: 2, answers: correctAnswers(TODAY, 1, "standard", 2) }, d2)).status).toBe(400);
  });

  it("gives each attempt different sequences, the same for every player", () => {
    const a1 = correctAnswers(TODAY, 4, "standard", 1);
    const a2 = correctAnswers(TODAY, 4, "standard", 2);
    expect(a1).not.toEqual(a2);
    expect(correctAnswers(TODAY, 4, "standard", 2)).toEqual(a2);
  });

  it("treats a missing attempt number as attempt 1 (older clients)", async () => {
    const d = deps();
    const res = await handleSubmit({ dateKey: TODAY, division: "standard", playerId: ID, displayName: "Ada", answers: correctAnswers(TODAY, 1) }, d);
    expect(res.body).toMatchObject({ outcome: "inserted", attempts: 1 });
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
  it("file store persists, applies best-of-two under concurrency and survives a corrupt file", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "synapse-"));
    const file = path.join(dir, "scores.json");
    const rec = { dateKey: TODAY, division: "standard" as const, playerId: ID, displayName: "Ada", feiMs: 4500, completed: 1, maxLength: 3, submittedAt: 1, attempts: 1 };
    const a = createFileStore(file);
    const results = await Promise.all([a.submit(rec), a.submit(rec)]);
    expect(results.map((r) => r.outcome).sort()).toEqual(["inserted", "unchanged"]);
    const improved = await a.submit({ ...rec, feiMs: 9000, completed: 2, attempts: 2 });
    expect(improved.outcome).toBe("improved");
    expect((await createFileStore(file).listDaily(TODAY, "standard"))[0]).toMatchObject({ feiMs: 9000, attempts: 2 });
    expect(JSON.parse(readFileSync(file, "utf8")).records).toHaveLength(1);
    expect(await createFileStore(file).listDaily(TODAY, "standard")).toHaveLength(1);

    writeFileSync(file, "{broken");
    const c = createFileStore(file);
    expect(await c.listDaily(TODAY, "standard")).toEqual([]);
  });

  it("supabase store submits through the best-of-two function and maps its row", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Response.json([
          { outcome: "kept", display_name: "Ada", fei_ms: 9000, completed: 2, max_length: 3, attempts: 2, submitted_at: "2026-10-13T11:00:00Z" },
        ]);
      }
      return Response.json([
        { date_key: TODAY, division: "standard", player_id: ID, display_name: "Ada", fei_ms: 4500, completed: 1, max_length: 3, submitted_at: "2026-10-13T12:00:00Z", attempts: 1 },
      ]);
    });
    const store = createSupabaseStore("https://x.supabase.co/", "service-key", fetchMock as unknown as typeof fetch);
    const rec = { dateKey: TODAY, division: "standard" as const, playerId: ID, displayName: "Ada", feiMs: 4500, completed: 1, maxLength: 3, submittedAt: 1, attempts: 2 };
    const result = await store.submit(rec);
    expect(result).toMatchObject({ outcome: "kept", record: { feiMs: 9000, attempts: 2, playerId: ID, dateKey: TODAY } });
    const [postUrl, postInit] = fetchMock.mock.calls[0]!;
    expect(postUrl).toBe("https://x.supabase.co/rest/v1/rpc/submit_daily_score");
    expect(JSON.parse(String(postInit!.body))).toEqual({
      p_date_key: TODAY, p_division: "standard", p_player_id: ID, p_display_name: "Ada",
      p_fei_ms: 4500, p_completed: 1, p_max_length: 3, p_attempt: 2,
    });
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

describe("store selection", () => {
  it("uses Supabase when a URL and either key variable are present", () => {
    expect(selectStoreKind({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k", VERCEL: "1" })).toBe("supabase");
    expect(selectStoreKind({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_x" })).toBe("supabase");
    expect(selectStoreKind({ SUPABASE_URL: "https://x.supabase.co" })).toBe("file");
  });

  it("lets an explicit LEADERBOARD_STORE override Supabase, so tests never touch a real project", () => {
    const real = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_x" };
    expect(selectStoreKind({ ...real, LEADERBOARD_STORE: "memory" })).toBe("memory");
    expect(selectStoreKind({ ...real, LEADERBOARD_STORE: "file" })).toBe("file");
  });

  it("never uses the file store on Vercel unless told to", () => {
    expect(selectStoreKind({ VERCEL: "1" })).toBe("serverless-memory");
    expect(selectStoreKind({ VERCEL: "1", LEADERBOARD_STORE: "memory" })).toBe("memory");
    expect(selectStoreKind({})).toBe("file");
    expect(selectStoreKind({ LEADERBOARD_STORE: "memory" })).toBe("memory");
  });

  it("labels the serverless fallback as temporary", () => {
    const store = createMemoryStore(SERVERLESS_LABEL);
    expect(store.info.isPreview).toBe(true);
    expect(store.info.label).toMatch(/temporary/);
  });
});

describe("Supabase keys", () => {
  const legacy = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2ln";

  it("recognises both key generations and the wrong kind", () => {
    expect(supabaseKeyKind("sb_secret_abc")).toBe("secret");
    expect(supabaseKeyKind("sb_publishable_abc")).toBe("publishable");
    expect(supabaseKeyKind(legacy)).toBe("legacy-service-role");
    expect(supabaseKeyKind("nonsense")).toBe("unknown");
  });

  it("never sends a new secret key as a Bearer token", () => {
    expect(supabaseAuthHeaders("sb_secret_abc")).toEqual({ apikey: "sb_secret_abc" });
    expect(supabaseAuthHeaders(legacy)).toEqual({ apikey: legacy, Authorization: `Bearer ${legacy}` });
  });

  it("sends the right headers and a timeout on every request", async () => {
    const calls: RequestInit[] = [];
    const fetchMock = (async (_url: string, init?: RequestInit) => {
      calls.push(init!);
      return init?.method === "POST"
        ? Response.json([{ outcome: "inserted", display_name: "Ada", fei_ms: 4500, completed: 1, max_length: 3, attempts: 1, submitted_at: "2026-10-13T12:00:00Z" }])
        : Response.json([]);
    }) as unknown as typeof fetch;
    const store = createSupabaseStore("https://x.supabase.co", "sb_secret_abc", fetchMock);
    await store.submit({ dateKey: TODAY, division: "standard", playerId: ID, displayName: "Ada", feiMs: 4500, completed: 1, maxLength: 3, submittedAt: 1, attempts: 1 });
    await store.listDaily(TODAY, "standard");
    for (const init of calls) {
      expect(init.headers).toMatchObject({ apikey: "sb_secret_abc" });
      expect(init.headers).not.toHaveProperty("Authorization");
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });
});

describe("best-of-two rule", () => {
  const base = { dateKey: TODAY, division: "standard" as const, playerId: ID, displayName: "Ada", feiMs: 4500, completed: 1, maxLength: 3, submittedAt: 1, attempts: 1 };

  it("inserts, improves, keeps and ignores resends", () => {
    expect(applySubmission(undefined, base).outcome).toBe("inserted");
    expect(applySubmission(base, { ...base, attempts: 1, feiMs: 99999 }).outcome).toBe("unchanged");
    expect(applySubmission(base, { ...base, attempts: 2, feiMs: 9000 })).toMatchObject({ outcome: "improved", record: { feiMs: 9000, attempts: 2 } });
    expect(applySubmission(base, { ...base, attempts: 2, feiMs: 3000, displayName: "Bo" })).toMatchObject({
      outcome: "kept",
      record: { feiMs: 4500, attempts: 2, displayName: "Bo", submittedAt: 1 },
    });
  });

  it("breaks an FEI tie on challenges completed", () => {
    expect(applySubmission(base, { ...base, attempts: 2, completed: 2 }).outcome).toBe("improved");
    expect(applySubmission(base, { ...base, attempts: 2 }).outcome).toBe("kept");
  });
});
