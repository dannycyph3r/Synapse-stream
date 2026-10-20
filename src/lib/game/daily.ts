import type { Division } from "./rules";

/**
 * Daily challenge identity.
 *
 * A daily challenge is keyed by its UTC calendar date, so every player in
 * every time zone plays the same challenge for the same 24 hours, and the
 * changeover happens at 00:00 UTC for everyone.
 *
 * The seed is public and derivable on the client. That is a deliberate
 * trade-off: it lets the daily challenge run offline and lets the server
 * regenerate and verify any submitted run. It also means a determined player
 * could compute the sequences ahead of time. See README, "Anti-cheat limits".
 */

export const DAILY_SEED_VERSION = "v1";

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** YYYY-MM-DD of the UTC calendar day containing `date`. */
export function utcDateKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isValidDateKey(key: string): boolean {
  const match = DATE_KEY.exec(key);
  if (!match) return false;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return utcDateKey(date) === key;
}

/** Ranked attempts per player, per division, per day. The better one counts. */
export const MAX_DAILY_ATTEMPTS = 2;

/**
 * Each division has its own sequences, so playing one reveals nothing about
 * the other. Each attempt has its own sequences too, the same for every
 * player: a second attempt never replays the pattern a failed first attempt
 * revealed. Attempt 1 keeps the original seed, so runs already played stay valid.
 */
export function dailySeed(dateKey: string, division: Division, attempt = 1): string {
  const base = `synapse-daily-${DAILY_SEED_VERSION}:${dateKey}:${division}`;
  return attempt === 1 ? base : `${base}:attempt-${attempt}`;
}

/** Milliseconds from `now` to the next 00:00 UTC. */
export function msUntilNextUtcDay(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return next - now.getTime();
}

/** The UTC day before `dateKey`. */
export function previousDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return utcDateKey(new Date(Date.UTC(y!, m! - 1, d! - 1)));
}

/**
 * Runs that start just before midnight UTC finish after it. The server
 * accepts a run for today, or for yesterday during the first hour of today.
 */
export const LATE_SUBMISSION_GRACE_MS = 60 * 60 * 1000;

export function acceptableDateKeys(now: Date): string[] {
  const today = utcDateKey(now);
  const sinceMidnight = now.getTime() - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return sinceMidnight < LATE_SUBMISSION_GRACE_MS ? [today, previousDateKey(today)] : [today];
}

/** "5 h 12 min" until reset. Minute precision keeps the display calm. */
export function formatCountdown(ms: number): string {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, "0")} min`;
}
