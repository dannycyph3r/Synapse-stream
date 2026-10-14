import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { utcDateKey } from "../../src/lib/game/daily";
import { buildChallenge, dailyConfig, practiceConfig } from "../../src/lib/game/engine";
import { TOKENS, type TokenId } from "../../src/lib/game/tokens";

/**
 * The tests know the sequences the same way the server does: by rebuilding
 * them from the public seed with the real engine. Nothing is read back out of
 * the page, which is also a check that the page does not expose them.
 */
export const SEED = "E2E";

export function practiceSequence(index: number): readonly TokenId[] {
  return buildChallenge(practiceConfig("standard", "foundation", "unused", SEED), index).sequence;
}

export function dailySequence(index: number, division: "standard" | "spoken" = "standard"): readonly TokenId[] {
  return buildChallenge(dailyConfig(utcDateKey(new Date()), division), index).sequence;
}

export function label(id: TokenId): string {
  return TOKENS.find((t) => t.id === id)!.label;
}

export function keyFor(id: TokenId): string {
  return TOKENS.find((t) => t.id === id)!.key;
}

export function wrongFor(id: TokenId): TokenId {
  return TOKENS.find((t) => t.id !== id)!.id;
}

export function tokenButton(page: Page, id: TokenId) {
  return page.getByRole("group", { name: "Tokens" }).getByRole("button", { name: label(id), exact: true });
}

/** Recall begins when focus lands on the first token key. */
export async function waitForRecall(page: Page) {
  await expect(page.getByRole("button", { name: "Circle", exact: true })).toBeFocused({ timeout: 30_000 });
}

export async function enter(page: Page, tokens: readonly TokenId[]) {
  for (const t of tokens) await tokenButton(page, t).click();
}

export async function submit(page: Page) {
  await page.getByRole("button", { name: "Submit" }).click();
}

export function bankedFei(page: Page) {
  return page.locator("dl").filter({ hasText: "Banked FEI" }).locator("dd").last();
}

export async function startPractice(page: Page) {
  await page.goto(`/play?mode=practice&seed=${SEED}`);
  await page.getByRole("button", { name: /Begin session/ }).click();
}

export async function expectNoAxeViolations(page: Page, context = "") {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const summary = results.violations.map(
    (v) => `${context} ${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`,
  );
  expect(summary).toEqual([]);
}

export async function expectNoHorizontalOverflow(page: Page, context = "") {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `horizontal overflow ${context}`).toBeLessThanOrEqual(0);
}
