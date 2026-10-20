/**
 * Runs the real Supabase migration in PGlite (Postgres compiled to WASM) with
 * Supabase's API roles recreated, then checks what each role can and cannot
 * do. This is the database half of the leaderboard, verified without a
 * Supabase project.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const MIGRATIONS = ["0001_daily_scores.sql", "0002_daily_attempts.sql"].map((f) =>
  readFileSync(path.join(import.meta.dirname, "../../supabase/migrations", f), "utf8"),
);
const MIGRATION = MIGRATIONS.join("\n");

/** The roles PostgREST switches into on Supabase. */
const SUPABASE_ROLES = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
`;

/** Supabase's long-standing default: new public tables are granted to every API role. */
const SUPABASE_DEFAULT_GRANTS = `
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

const ROW = `('2026-10-20', 'standard', '3f2b8c1e-6a0d-4e7b-9c55-1d2e3f4a5b6c', 'Ada', 4500, 1, 3)`;
const INSERT = `insert into public.daily_scores (date_key, division, player_id, display_name, fei_ms, completed, max_length) values `;

async function as(db: PGlite, role: string, sql: string) {
  await db.exec(`set role ${role}`);
  try {
    return await db.query(sql);
  } finally {
    await db.exec("reset role");
  }
}

async function errorCode(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (err) {
    return (err as { code?: string }).code ?? "unknown";
  }
}

describe("leaderboard migration on Supabase defaults", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(SUPABASE_ROLES + SUPABASE_DEFAULT_GRANTS);
    await db.exec(MIGRATION);
  });
  afterAll(() => db.close());

  it("can be run twice without error", async () => {
    await expect(db.exec(MIGRATION)).resolves.toBeDefined();
  });

  it("lets the service role insert, read and delete", async () => {
    await as(db, "service_role", INSERT + ROW);
    const rows = await as(db, "service_role", "select player_id, fei_ms from public.daily_scores");
    expect(rows.rows).toHaveLength(1);
  });

  it("rejects a second record for the same player, day and division with 23505", async () => {
    expect(await errorCode(as(db, "service_role", INSERT + ROW))).toBe("23505");
  });

  it("enforces the name pattern and length bounds in the database too", async () => {
    const badName = `('2026-10-20', 'standard', '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d', '<b>', 4500, 1, 3)`;
    const tooLong = `('2026-10-20', 'standard', '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d', 'Bo', 4500, 1, 13)`;
    const badDivision = `('2026-10-20', 'turbo', '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d', 'Bo', 4500, 1, 3)`;
    expect(await errorCode(as(db, "service_role", INSERT + badName))).toBe("23514");
    expect(await errorCode(as(db, "service_role", INSERT + tooLong))).toBe("23514");
    expect(await errorCode(as(db, "service_role", INSERT + badDivision))).toBe("23514");
  });

  for (const role of ["anon", "authenticated"]) {
    describe(`${role} (browser) role`, () => {
      it("can read the public columns", async () => {
        const r = await as(db, role, "select date_key, division, display_name, fei_ms, completed, max_length, submitted_at from public.daily_scores");
        expect(r.rows).toHaveLength(1);
      });

      it("cannot read player ids", async () => {
        expect(await errorCode(as(db, role, "select player_id from public.daily_scores"))).toBe("42501");
        expect(await errorCode(as(db, role, "select * from public.daily_scores"))).toBe("42501");
      });

      it("cannot insert, update, delete or truncate", async () => {
        const other = `('2026-10-20', 'standard', '00000000-0000-4000-8000-000000000001', 'Eve', 999999, 99, 12)`;
        expect(await errorCode(as(db, role, INSERT + other))).toBe("42501");
        expect(await errorCode(as(db, role, "update public.daily_scores set fei_ms = 999999"))).toBe("42501");
        expect(await errorCode(as(db, role, "delete from public.daily_scores"))).toBe("42501");
        expect(await errorCode(as(db, role, "truncate public.daily_scores"))).toBe("42501");
      });
    });
  }

  it("still holds one row after every attempted write", async () => {
    const r = await db.query("select count(*)::int as n from public.daily_scores");
    expect((r.rows[0] as { n: number }).n).toBe(1);
  });
});

describe("leaderboard migration without automatic grants", () => {
  it("still lets the server write, through its explicit grant", async () => {
    const db = new PGlite();
    await db.exec(SUPABASE_ROLES);
    await db.exec(MIGRATION);
    await as(db, "service_role", INSERT + ROW);
    const r = await as(db, "anon", "select display_name from public.daily_scores");
    expect(r.rows).toEqual([{ display_name: "Ada" }]);
    await db.close();
  });
});

describe("two-attempt function (migration 0002)", () => {
  let db: PGlite;
  const PLAYER = "3f2b8c1e-6a0d-4e7b-9c55-1d2e3f4a5b6c";
  const call = (fei: number, completed: number, attempt: number, name = "Ada", role = "service_role") =>
    as(
      db,
      role,
      `select * from public.submit_daily_score('2026-10-20', 'standard', '${PLAYER}', '${name}', ${fei}, ${completed}, 3, ${attempt})`,
    );

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(SUPABASE_ROLES + SUPABASE_DEFAULT_GRANTS);
    await db.exec(MIGRATIONS[0]!);
    // An existing board from before 0002: its rows count as one attempt.
    await as(db, "service_role", INSERT + `('2026-10-19', 'standard', '${PLAYER}', 'Ada', 4500, 1, 3)`);
    await db.exec(MIGRATIONS[1]!);
    await db.exec(MIGRATIONS[1]!); // re-runnable
  });
  afterAll(() => db.close());

  it("gives existing rows one counted attempt", async () => {
    const r = await db.query(`select attempts from public.daily_scores where date_key = '2026-10-19'`);
    expect(r.rows).toEqual([{ attempts: 1 }]);
  });

  it("inserts, keeps the better score, and ignores resends", async () => {
    expect((await call(4500, 1, 1)).rows[0]).toMatchObject({ outcome: "inserted", fei_ms: 4500, attempts: 1 });
    expect((await call(9000, 2, 1)).rows[0]).toMatchObject({ outcome: "unchanged", fei_ms: 4500, attempts: 1 });
    expect((await call(9000, 2, 2)).rows[0]).toMatchObject({ outcome: "improved", fei_ms: 9000, attempts: 2 });
    expect((await call(99999, 9, 2)).rows[0]).toMatchObject({ outcome: "unchanged", fei_ms: 9000 });
    const rows = await db.query(`select count(*)::int as n from public.daily_scores where date_key = '2026-10-20'`);
    expect(rows.rows).toEqual([{ n: 1 }]);
  });

  it("keeps the earlier, better score and its time when attempt 2 is worse", async () => {
    const other = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
    const first = await as(db, "service_role", `select * from public.submit_daily_score('2026-10-20', 'spoken', '${other}', 'Bo', 9000, 2, 3, 1)`);
    const second = await as(db, "service_role", `select * from public.submit_daily_score('2026-10-20', 'spoken', '${other}', 'Bo L', 4500, 1, 3, 2)`);
    const a = first.rows[0] as { submitted_at: Date };
    expect(second.rows[0]).toMatchObject({ outcome: "kept", fei_ms: 9000, attempts: 2, display_name: "Bo L" });
    expect((second.rows[0] as { submitted_at: Date }).submitted_at).toEqual(a.submitted_at);
  });

  it("rejects attempt numbers other than 1 and 2 before touching a row", async () => {
    expect(await errorCode(call(1, 1, 0))).toBe("22023");
    expect(await errorCode(call(1, 1, 3))).toBe("22023");
  });

  it("still enforces the table's checks", async () => {
    const fresh = "00000000-0000-4000-8000-0000000000aa";
    const sql = (name: string, len: number) =>
      `select * from public.submit_daily_score('2026-10-20', 'standard', '${fresh}', '${name}', 4500, 1, ${len}, 1)`;
    expect(await errorCode(as(db, "service_role", sql("<b>", 3)))).toBe("23514");
    expect(await errorCode(as(db, "service_role", sql("Cy", 13)))).toBe("23514");
  });

  it("cannot be called by browser roles", async () => {
    expect(await errorCode(call(4500, 1, 1, "Eve", "anon"))).toBe("42501");
    expect(await errorCode(call(4500, 1, 1, "Eve", "authenticated"))).toBe("42501");
  });

  it("still lets browsers read only the public columns", async () => {
    expect(await errorCode(as(db, "anon", "select attempts from public.daily_scores"))).toBe("42501");
    expect(await errorCode(as(db, "anon", "update public.daily_scores set fei_ms = 1"))).toBe("42501");
  });
});
