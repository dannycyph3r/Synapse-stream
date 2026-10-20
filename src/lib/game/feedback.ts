/** "Position 3 did not match." or "Positions 2, 4 and 5 did not match." */
export function mismatchSentence(positions: readonly number[]): string {
  if (positions.length === 0) return "The pattern did not match.";
  if (positions.length === 1) return `Position ${positions[0]} did not match.`;
  const head = positions.slice(0, -1).join(", ");
  return `Positions ${head} and ${positions.at(-1)} did not match.`;
}
