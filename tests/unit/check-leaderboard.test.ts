import { describe, expect, it } from "vitest";
// @ts-expect-error: plain JavaScript script without type declarations
import { checkLeaderboard } from "../../scripts/check-leaderboard.mjs";

type Result = { ok: boolean; label: string; detail: string };

const URL_OK = "https://abcd.supabase.co";

const RPC_INSTALLED = () => new Response('{"code":"22023","message":"attempt must be 1 or 2"}', { status: 400 });

/** A fake Supabase. Calls to the two-attempt function answer as if migration 0002 is installed unless `rpc` says otherwise. */
function fakeFetch(
  handler: (url: string, headers: Record<string, string>) => Response | Promise<Response>,
  rpc: () => Response = RPC_INSTALLED,
) {
  return (async (url: string, init?: RequestInit) =>
    url.includes("/rpc/") ? rpc() : handler(url, (init?.headers ?? {}) as Record<string, string>)) as typeof fetch;
}

async function run(opts: Record<string, unknown>): Promise<Result[]> {
  return checkLeaderboard(opts);
}

const failed = (r: Result[]) => r.filter((x) => !x.ok).map((x) => x.label);

describe("check:leaderboard", () => {
  it("passes a correctly configured project with a new secret key", async () => {
    const r = await run({
      url: URL_OK,
      key: "sb_secret_abc",
      browserKey: "sb_publishable_xyz",
      fetchImpl: fakeFetch((url, headers) => {
        if (headers.apikey === "sb_publishable_xyz") {
          return url.includes("select=player_id") ? new Response('{"code":"42501"}', { status: 401 }) : Response.json([]);
        }
        expect(headers).not.toHaveProperty("Authorization");
        return Response.json([]);
      }),
    });
    expect(failed(r)).toEqual([]);
  });

  it("points at the migration when the table is missing", async () => {
    const r = await run({ url: URL_OK, key: "sb_secret_abc", fetchImpl: fakeFetch(() => new Response('{"code":"PGRST205"}', { status: 404 })) });
    expect(failed(r)).toEqual(["Table public.daily_scores exists"]);
    expect(r.at(-1)!.detail).toMatch(/0001_daily_scores\.sql/);
  });

  it("asks for migration 0002 when the two-attempt function is missing", async () => {
    const r = await run({
      url: URL_OK,
      key: "sb_secret_abc",
      fetchImpl: fakeFetch(() => Response.json([]), () => new Response('{"code":"PGRST202"}', { status: 404 })),
    });
    expect(failed(r)).toEqual(["Two-attempt function (migration 0002) is installed"]);
    expect(r.find((x) => !x.ok)!.detail).toMatch(/0002_daily_attempts\.sql/);
  });

  it("explains a rejected key, a publishable key and a dashboard URL", async () => {
    const denied = await run({ url: URL_OK, key: "sb_secret_bad", fetchImpl: fakeFetch(() => new Response("", { status: 401 })) });
    expect(failed(denied)).toEqual(["Key is accepted"]);
    const publishable = await run({ url: URL_OK, key: "sb_publishable_abc", fetchImpl: fakeFetch(() => Response.json([])) });
    expect(failed(publishable)).toEqual(["Server key is a secret key"]);
    const dashboard = await run({ url: "https://supabase.com/dashboard/project/abcd", key: "sb_secret_abc" });
    expect(failed(dashboard)).toEqual(["SUPABASE_URL is the project API URL"]);
  });

  it("flags a project that exposes player ids to browsers", async () => {
    const r = await run({ url: URL_OK, key: "sb_secret_abc", browserKey: "sb_publishable_xyz", fetchImpl: fakeFetch(() => Response.json([])) });
    expect(failed(r)).toEqual(["Browsers cannot read player ids"]);
  });

  it("reports an unreachable or paused project", async () => {
    const r = await run({
      url: URL_OK,
      key: "sb_secret_abc",
      fetchImpl: (async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof fetch,
    });
    expect(failed(r)).toEqual(["Project is reachable"]);
  });

  it("asks for missing settings", async () => {
    expect(failed(await run({}))).toEqual(["SUPABASE_URL is set"]);
    expect(failed(await run({ url: URL_OK }))).toEqual(["Server key is set"]);
  });
});
