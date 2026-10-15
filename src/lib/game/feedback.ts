import type { FailureRecord } from "./engine";
import { tokenLabel } from "./tokens";

/** "Position 3 did not match." or "Positions 2, 4 and 5 did not match." */
export function mismatchSentence(positions: readonly number[]): string {
  if (positions.length === 0) return "The pattern did not match.";
  if (positions.length === 1) return `Position ${positions[0]} did not match.`;
  const head = positions.slice(0, -1).join(", ");
  return `Positions ${head} and ${positions.at(-1)} did not match.`;
}

/**
 * Plain-language detail for the first few mismatches, for example
 * "At 3 you entered Circle; the pattern had Triangle."
 */
export function mismatchDetails(failure: FailureRecord, limit = 3): string[] {
  const lines = failure.mismatches.slice(0, limit).map((p) => {
    const given = failure.answer[p - 1];
    const expected = failure.expected[p - 1]!;
    return `At ${p} you entered ${given ? tokenLabel(given) : "nothing"}; the pattern had ${tokenLabel(expected)}.`;
  });
  const rest = failure.mismatches.length - limit;
  if (rest > 0) lines.push(`${rest} more position${rest === 1 ? "" : "s"} also differed.`);
  return lines;
}
