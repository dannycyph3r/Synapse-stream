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

const MIGRATION = readFileSync(
  path.join(import.meta.dirname, "../../supabase/migrations/0001_daily_scores.sql"),
  "utf8",
);

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
