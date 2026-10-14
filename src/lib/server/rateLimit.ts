/**
 * Fixed-window rate limiter keyed by client address.
 *
 * In-process only: each server instance counts on its own, so on a
 * multi-instance deployment the effective limit multiplies. A production
 * deployment should move this into the edge or the database.
 */
export interface RateLimiter {
  /** True if the request is allowed, false if the key is over its limit. */
  hit(key: string, now: number): boolean;
}

export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    hit(key, now) {
      if (windows.size > 10_000) {
        for (const [k, w] of windows) if (now - w.start >= windowMs) windows.delete(k);
      }
      const w = windows.get(key);
      if (!w || now - w.start >= windowMs) {
        windows.set(key, { start: now, count: 1 });
        return true;
      }
      w.count += 1;
      return w.count <= limit;
    },
  };
}

export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "local";
}
