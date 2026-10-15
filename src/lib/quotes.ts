/**
 * Lines shown between rounds.
 *
 * Every line is original to SYNAPSE. None is attributed to a person, so none
 * can be misattributed. Help says so. To add a quotation from a real author,
 * give it a `source` that names the exact work, and verify both the wording and
 * the translation's copyright status first.
 *
 * Success lines follow a held pattern; failure lines follow a broken one.
 * The pools never share a line.
 */
import { createRng } from "@/lib/game/random";

export type QuoteKind = "success" | "failure";

export interface Quote {
  id: string;
  text: string;
  /** null for original SYNAPSE lines. */
  source: string | null;
}

const line = (kind: "s" | "f", n: number, text: string): Quote => ({ id: `${kind}${n}`, text, source: null });

export const SUCCESS_QUOTES: readonly Quote[] = [
  line("s", 1, "Stay with the task."),
  line("s", 2, "Discipline is choosing the next step."),
  line("s", 3, "Small acts of focus become strength."),
  line("s", 4, "You do not need ease. You need consistency."),
  line("s", 5, "Hold it. Then hold the next one."),
  line("s", 6, "Attention is a muscle. Keep loading it."),
  line("s", 7, "Steady beats fast."),
  line("s", 8, "One pattern at a time."),
  line("s", 9, "The work is the reward."),
  line("s", 10, "Stay here. The next one is harder."),
  line("s", 11, "Earn the next sequence."),
  line("s", 12, "Quiet mind. Precise hands."),
  line("s", 13, "Repetition builds the edge."),
  line("s", 14, "Keep the standard when it gets hard."),
];

export const FAILURE_QUOTES: readonly Quote[] = [
  line("f", 1, "The obstacle is the work."),
  line("f", 2, "Endure the moment in front of you."),
  line("f", 3, "A miss is information. Use it."),
  line("f", 4, "Reset. Breathe. Go again."),
  line("f", 5, "Failure is where the next rep starts."),
  line("f", 6, "You found the edge. Now move it."),
  line("f", 7, "Look at what broke, then begin again."),
  line("f", 8, "The pattern was hard. That was the point."),
  line("f", 9, "Discomfort is the price of progress."),
  line("f", 10, "Stand back up. Take the next run."),
];

export const QUOTES: Record<QuoteKind, readonly Quote[]> = {
  success: SUCCESS_QUOTES,
  failure: FAILURE_QUOTES,
};

/** Fisher-Yates permutation of 0..n-1, fixed for a seed. */
export function permutation(n: number, seed: string): number[] {
  const rng = createRng(seed);
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

/**
 * The `index`-th quote of a session. Each pass through a pool is a fresh
 * shuffle, so no line repeats until the whole pool has been shown, and a new
 * pass never opens with the line that closed the previous one.
 */
export function selectQuote(kind: QuoteKind, sessionSeed: string, index: number): Quote {
  const pool = QUOTES[kind];
  const n = pool.length;
  const i = Math.max(0, Math.floor(index));
  const pass = Math.floor(i / n);
  const order = passOrder(kind, sessionSeed, pass, n);
  return pool[order[i % n]!]!;
}

function passOrder(kind: QuoteKind, seed: string, pass: number, n: number): number[] {
  const order = permutation(n, `${seed}:${kind}:${pass}`);
  if (pass > 0 && n > 1) {
    const prev = permutation(n, `${seed}:${kind}:${pass - 1}`);
    if (order[0] === prev[n - 1]) [order[0], order[1]] = [order[1]!, order[0]!];
  }
  return order;
}
