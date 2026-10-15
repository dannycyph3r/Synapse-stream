import { TokenGlyph } from "@/components/TokenGlyph";
import type { FailureRecord } from "@/lib/game/engine";
import { tokenLabel, type TokenId } from "@/lib/game/tokens";

/** Positions per table. Twelve tokens become two stacked blocks, so a 320 px screen never scrolls sideways. */
export const COMPARE_CHUNK = 6;

const pad = (n: number) => String(n).padStart(2, "0");

function Cell({ token, miss }: { token: TokenId | undefined; miss: boolean }) {
  return (
    <td data-miss={miss || undefined}>
      {token ? (
        <>
          <TokenGlyph token={token} />
          <span className="sr-only">{tokenLabel(token)}</span>
        </>
      ) : (
        <span className="sr-only">Empty</span>
      )}
    </td>
  );
}

/**
 * Your pattern above the correct pattern, aligned by position. A mismatch is
 * marked by structure (an inverted position number and a heavier outline) and
 * named in text, never by colour alone. Real tables with row and column
 * headers, so screen readers can read it cell by cell.
 */
export function PatternComparison({ failure }: { failure: FailureRecord }) {
  const miss = new Set(failure.mismatches);
  const positions = Array.from({ length: failure.length }, (_, i) => i + 1);
  const chunks: number[][] = [];
  for (let i = 0; i < positions.length; i += COMPARE_CHUNK) chunks.push(positions.slice(i, i + COMPARE_CHUNK));

  return (
    <div className="grid justify-items-start gap-4" data-testid="pattern-comparison">
      {chunks.map((chunk) => (
        <table key={chunk[0]} className="compare">
          <caption className="sr-only">
            {chunks.length > 1 ? `Positions ${chunk[0]} to ${chunk.at(-1)}. ` : ""}
            Your pattern compared with the correct pattern.
          </caption>
          <thead>
            <tr>
              <td aria-hidden="true" />
              {chunk.map((p) => (
                <th key={p} scope="col" data-miss={miss.has(p) || undefined}>
                  <span aria-hidden="true">{pad(p)}</span>
                  <span className="sr-only">
                    Position {p}
                    {miss.has(p) ? ", did not match" : ""}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" className="label !text-ink">
                Your pattern
              </th>
              {chunk.map((p) => (
                <Cell key={p} token={failure.answer[p - 1]} miss={miss.has(p)} />
              ))}
            </tr>
            <tr>
              <th scope="row" className="label !text-ink">
                Correct pattern
              </th>
              {chunk.map((p) => (
                <Cell key={p} token={failure.expected[p - 1]} miss={miss.has(p)} />
              ))}
            </tr>
          </tbody>
        </table>
      ))}
    </div>
  );
}
