import { createRng } from "./random";
import { TOKEN_IDS, type TokenId } from "./tokens";

/** No token appears more than this many times in a row. */
export const MAX_RUN = 2;

/**
 * Sequence for one challenge of a run.
 *
 * Each challenge has its own derived seed (`seed#index`), so challenge 14 can
 * be regenerated without generating challenges 0 to 13 first. Repeats are
 * allowed, since they are a real working-memory demand, but never three in a
 * row: a triple repeat reads as a stuck display rather than as a pattern.
 */
export function generateSequence(seed: string, index: number, length: number): TokenId[] {
  const rng = createRng(`${seed}#${index}`);
  const out: TokenId[] = [];
  while (out.length < length) {
    const candidate = TOKEN_IDS[rng.int(TOKEN_IDS.length)]!;
    const n = out.length;
    if (n >= MAX_RUN && out.slice(n - MAX_RUN).every((t) => t === candidate)) continue;
    out.push(candidate);
  }
  return out;
}

/**
 * A response is correct only when every position holds the right token.
 * The right tokens in the wrong order, a partial answer, or an answer that is
 * too long are all incorrect.
 */
export function sequencesMatch(
  expected: readonly TokenId[],
  answer: readonly TokenId[],
): boolean {
  if (expected.length !== answer.length) return false;
  for (let i = 0; i < expected.length; i++) {
    if (expected[i] !== answer[i]) return false;
  }
  return true;
}

export interface PositionReview {
  position: number;
  expected: TokenId;
  given: TokenId | null;
  correct: boolean;
}

/** Position-by-position comparison, used only by the opt-in practice review. */
export function reviewPositions(
  expected: readonly TokenId[],
  answer: readonly TokenId[],
): PositionReview[] {
  return expected.map((token, i) => ({
    position: i + 1,
    expected: token,
    given: answer[i] ?? null,
    correct: answer[i] === token,
  }));
}
