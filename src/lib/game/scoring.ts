/**
 * Focus Endurance Index (FEI).
 *
 *   FEI = sum over correctly completed challenges of
 *         (sequence length x presentation duration per token)
 *
 * It is the scheduled presentation time the player held and reproduced. It is
 * a game score, not a measurement of attention. Because it is computed only
 * from the difficulty schedule, nothing the player does with time (waiting
 * before submitting, pausing, switching tabs) can raise it.
 *
 * Every screen, the results view and the server use these functions; the
 * formula exists in this file only.
 */

export function challengeContributionMs(length: number, durationMs: number): number {
  return length * durationMs;
}

export interface ScoredChallenge {
  length: number;
  durationMs: number;
  correct: boolean;
}

export function totalFeiMs(challenges: readonly ScoredChallenge[]): number {
  let total = 0;
  for (const c of challenges) {
    if (c.correct) total += challengeContributionMs(c.length, c.durationMs);
  }
  return total;
}

/**
 * MM:SS.t, for example 02:34.5. Tenths are truncated rather than rounded, so a
 * score never displays higher than it is. Minutes keep counting past 59.
 * With the shipped rules every FEI is a whole number of tenths anyway.
 */
export function formatFei(ms: number): string {
  const safe = Math.max(0, Math.floor(ms));
  const tenths = Math.floor(safe / 100);
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor((tenths % 600) / 10);
  const t = tenths % 10;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${t}`;
}

/** Spoken or screen-reader form of an FEI, for example "2 minutes 34.5 seconds". */
export function describeFei(ms: number): string {
  const tenths = Math.floor(Math.max(0, ms) / 100);
  const minutes = Math.floor(tenths / 600);
  const seconds = (tenths % 600) / 10;
  const s = `${seconds.toFixed(1)} seconds`;
  if (minutes === 0) return s;
  return `${minutes} minute${minutes === 1 ? "" : "s"} ${s}`;
}

/** Per-token duration, for example 1.5 s. */
export function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

/** Signed difference in seconds, for example +4.5 s. */
export function formatDelta(ms: number): string {
  const sign = ms > 0 ? "+" : ms < 0 ? "−" : "±";
  return `${sign}${(Math.abs(ms) / 1000).toFixed(1)} s`;
}
