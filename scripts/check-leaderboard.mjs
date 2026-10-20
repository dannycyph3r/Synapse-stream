#!/usr/bin/env node
/**
 * npm run check:leaderboard
 *
 * Read-only check that a Supabase project is ready for the SYNAPSE
 * leaderboard. It never writes: the one function call it makes is rejected by
 * the function itself before any row is touched. Reads SUPABASE_URL and SUPABASE_SECRET_KEY
 * (or SUPABASE_SERVICE_ROLE_KEY) from the environment or .env.local.
 * Optionally checks SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY) to confirm
 * that browsers cannot read player ids.
 */
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const TABLE = "daily_scores";
const PUBLIC_COLUMNS = "date_key,division,display_name,fei_ms,completed,max_length,submitted_at";

function keyKind(key) {
  if (key.startsWith("sb_secret_")) return "secret";
  if (key.startsWith("sb_publishable_")) return "publishable";
  if (key.split(".").length === 3 && key.startsWith("eyJ")) return "legacy";
  return "unknown";
}

function headersFor(key) {
  return keyKind(key) === "legacy" ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key };
}

/**
 * Runs every check and returns a list of { ok, label, detail } results.
 * `fetchImpl` is injectable for tests.
 */
export async function checkLeaderboard({ url, key, browserKey, fetchImpl = fetch, timeoutMs = 8000 }) {
  const results = [];
  const add = (ok, label, detail = "") => results.push({ ok, label, detail });

  if (!url) {
    add(false, "SUPABASE_URL is set", "Add it from Project Settings > API (it looks like https://abcd.supabase.co).");
    return results;
  }
  let base;
  try {
    base = new URL(url);
  } catch {
    add(false, "SUPABASE_URL is a valid URL", `Got "${url}".`);
    return results;
  }
  if (base.hostname === "supabase.com" || base.hostname.endsWith(".supabase.com")) {
    add(false, "SUPABASE_URL is the project API URL", "That is a dashboard link. Use the Project URL from Project Settings > API, ending in .supabase.co.");
    return results;
  }
  add(true, "SUPABASE_URL is set", base.origin);

  if (!key) {
    add(false, "Server key is set", "Set SUPABASE_SECRET_KEY (sb_secret_...) or SUPABASE_SERVICE_ROLE_KEY.");
    return results;
  }
  const kind = keyKind(key);
  if (kind === "publishable") {
    add(false, "Server key is a secret key", "That is the publishable (browser) key. Use a secret key (sb_secret_...) instead.");
    return results;
  }
  add(kind !== "unknown", "Server key format", kind === "secret" ? "new secret key" : kind === "legacy" ? "legacy service_role key" : "unrecognised format; it may still work");

  const endpoint = `${base.origin}/rest/v1/${TABLE}`;
  let res;
  try {
    res = await fetchImpl(`${endpoint}?select=player_id,${PUBLIC_COLUMNS}&limit=1`, {
      headers: headersFor(key),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    add(false, "Project is reachable", `${err?.name === "TimeoutError" ? "Timed out" : "Network error"}. Check the URL, and restore the project if it is paused.`);
    return results;
  }
  const body = await res.text();
  if (res.ok) {
    add(true, "Project is reachable and the key is accepted");
    add(true, `Table public.${TABLE} exists and the server can read it`);
  } else if (res.status === 401 || res.status === 403) {
    add(false, "Key is accepted", `HTTP ${res.status}. The key is wrong, revoked, or for another project.`);
    return results;
  } else if (res.status === 404 || body.includes("PGRST205") || body.includes("42P01")) {
    add(true, "Project is reachable and the key is accepted");
    add(false, `Table public.${TABLE} exists`, "Run supabase/migrations/0001_daily_scores.sql (SQL Editor, or `supabase db push`).");
    return results;
  } else {
    add(false, "Table can be read", `HTTP ${res.status}: ${body.slice(0, 200)}`);
    return results;
  }

  // The best-of-two function from migration 0002. Probed with an invalid
  // attempt number, which the function rejects before touching any row.
  try {
    const rpc = await fetchImpl(`${base.origin}/rest/v1/rpc/submit_daily_score`, {
      method: "POST",
      headers: { ...headersFor(key), "Content-Type": "application/json" },
      body: JSON.stringify({
        p_date_key: "2000-01-01",
        p_division: "standard",
        p_player_id: "00000000-0000-4000-8000-000000000000",
        p_display_name: "check",
        p_fei_ms: 0,
        p_completed: 0,
        p_max_length: 0,
        p_attempt: 0,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await rpc.text();
    if (text.includes("22023") || text.includes("attempt must be 1 or 2")) {
      add(true, "Two-attempt function (migration 0002) is installed");
    } else if (rpc.status === 404 || text.includes("PGRST202")) {
      add(false, "Two-attempt function (migration 0002) is installed", "Run supabase/migrations/0002_daily_attempts.sql (SQL Editor, or `npx supabase db push`).");
    } else {
      add(false, "Two-attempt function (migration 0002) is installed", `Unexpected HTTP ${rpc.status}: ${text.slice(0, 160)}`);
    }
  } catch {
    add(false, "Two-attempt function (migration 0002) is installed", "Network error.");
  }

  if (browserKey) {
    const kindB = keyKind(browserKey);
    try {
      const pub = await fetchImpl(`${endpoint}?select=${PUBLIC_COLUMNS}&limit=1`, {
        headers: headersFor(browserKey),
        signal: AbortSignal.timeout(timeoutMs),
      });
      add(pub.ok, "Browsers can read public columns", pub.ok ? "" : `HTTP ${pub.status}. Re-run the migration.`);
      const priv = await fetchImpl(`${endpoint}?select=player_id&limit=1`, {
        headers: headersFor(browserKey),
        signal: AbortSignal.timeout(timeoutMs),
      });
      add(!priv.ok, "Browsers cannot read player ids", priv.ok ? "player_id is exposed. Re-run the migration." : "");
    } catch {
      add(false, `Browser key (${kindB}) checks ran`, "Network error.");
    }
  } else {
    add(true, "Browser-role checks skipped", "Set SUPABASE_PUBLISHABLE_KEY to also confirm player ids are hidden.");
  }
  return results;
}

async function main() {
  for (const file of [".env.local", ".env"]) {
    if (existsSync(file) && typeof process.loadEnvFile === "function") {
      try {
        process.loadEnvFile(file);
      } catch {
        // ignore unreadable env files
      }
    }
  }
  const env = process.env;
  const results = await checkLeaderboard({
    url: env.SUPABASE_URL,
    key: env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY,
    browserKey: env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY,
  });
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.label}${r.detail ? `\n      ${r.detail}` : ""}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `\n${failed} check(s) failed.` : "\nReady: the leaderboard can connect to this project.");
  process.exitCode = failed ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
