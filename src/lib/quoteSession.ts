"use client";

/**
 * Per-tab quote cursor. A browser session (one tab, kept across reloads via
 * sessionStorage) walks each pool in its own shuffled order, so lines do not
 * repeat across runs until the pool is used up. Falls back to memory when
 * sessionStorage is unavailable.
 */
import { randomSeed } from "@/lib/game/random";
import type { QuoteKind } from "./quotes";

const KEY = "synapse:quotes";

interface Cursor {
  seed: string;
  success: number;
  failure: number;
}

let memory: Cursor | null = null;

function isCursor(v: unknown): v is Cursor {
  const c = v as Cursor;
  return (
    !!c &&
    typeof c.seed === "string" &&
    Number.isInteger(c.success) &&
    c.success >= 0 &&
    Number.isInteger(c.failure) &&
    c.failure >= 0
  );
}

function load(): Cursor {
  if (memory) return memory;
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(KEY) ?? "null");
    if (isCursor(parsed)) {
      memory = parsed;
      return memory;
    }
  } catch {
    // fall through to a fresh cursor
  }
  memory = { seed: randomSeed(), success: 0, failure: 0 };
  save(memory);
  return memory;
}

function save(c: Cursor): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    // memory only
  }
}

export function quoteCursor(): Cursor {
  return { ...load() };
}

/** Marks `count` lines of a pool as shown. */
export function advanceQuotes(kind: QuoteKind, count = 1): void {
  const c = load();
  memory = { ...c, [kind]: c[kind] + count };
  save(memory);
}
