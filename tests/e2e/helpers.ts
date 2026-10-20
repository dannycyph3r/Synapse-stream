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

export function practiceSequence(index: number, level: "foundation" | "extended" | "deep" = "foundation"): readonly TokenId[] {
  return buildChallenge(practiceConfig("standard", level, "unused", SEED), index).sequence;
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

/** The visible FEI figure in the instrument strip. */
export function bankedFei(page: Page) {
  return page.locator(".game-metrics dd").nth(3).locator('[aria-hidden="true"]');
}

export function roundNumber(page: Page) {
  return page.locator(".game-metrics dd").first();
}

/** A fresh browser context has never seen the rules, so the start screen shows once. */
export async function startPractice(page: Page, query = "") {
  await page.goto(`/play?mode=practice&seed=${SEED}${query}`);
  await page.getByRole("button", { name: "Play", exact: true }).click();
}

export function resultsHeading(page: Page) {
  return page.getByRole("heading", { level: 1 });
}

/** Reads one row of the comparison tables as token names, in position order. */
export async function comparisonRow(page: Page, row: "Your pattern" | "Correct pattern"): Promise<string[]> {
  const rows = page.getByTestId("pattern-comparison").getByRole("row", { name: new RegExp(`^${row}`) });
  const names: string[] = [];
  for (let i = 0; i < (await rows.count()); i++) {
    const cells = rows.nth(i).getByRole("cell");
    for (let j = 0; j < (await cells.count()); j++) names.push((await cells.nth(j).innerText()).trim());
  }
  return names;
}

export async function failRound(page: Page, expected: readonly TokenId[], position = 1) {
  const answer = [...expected];
  answer[position - 1] = wrongFor(expected[position - 1]!);
  await enter(page, answer);
  await submit(page);
  return answer;
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
