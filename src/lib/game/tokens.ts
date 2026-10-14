/**
 * The eight tokens a sequence is built from.
 *
 * Each token has a distinct silhouette (no two differ only by fill or colour),
 * a text label for assistive technology, and a fixed keyboard key so the
 * keypad can be played without a pointer.
 */
export const TOKEN_IDS = [
  "circle",
  "square",
  "triangle",
  "diamond",
  "cross",
  "bars",
  "star",
  "arc",
] as const;

export type TokenId = (typeof TOKEN_IDS)[number];

export interface TokenDef {
  id: TokenId;
  /** Human label, used for accessible names and spoken presentation. */
  label: string;
  /** Keyboard key that selects this token during recall. */
  key: string;
}

export const TOKENS: readonly TokenDef[] = TOKEN_IDS.map((id, i) => ({
  id,
  label: id.charAt(0).toUpperCase() + id.slice(1),
  key: String(i + 1),
}));

const TOKEN_SET: ReadonlySet<string> = new Set(TOKEN_IDS);

export function isTokenId(value: unknown): value is TokenId {
  return typeof value === "string" && TOKEN_SET.has(value);
}

export function tokenLabel(id: TokenId): string {
  return TOKENS.find((t) => t.id === id)?.label ?? id;
}

export function tokenForKey(key: string): TokenId | null {
  return TOKENS.find((t) => t.key === key)?.id ?? null;
}
