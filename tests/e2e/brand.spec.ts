import { expect, test } from "@playwright/test";

const ROUTES = ["/", "/help", "/leaderboard", "/stats", "/settings", "/play?mode=practice", "/play?mode=daily", "/missing-page"];

test("SYNAPSE branding is consistent and the old name is gone", async ({ page }) => {
  for (const path of ROUTES) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveTitle(/SYNAPSE/);
    const text = await page.locator("body").innerText();
    expect(text, path).not.toMatch(/Synapse Stream/i);
    await expect(page.getByRole("link", { name: "SYNAPSE, home" }).first()).toBeVisible();
  }
});

test("the launch screen holds only what starts a session", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("Hold the pattern.");
  await expect(page.getByRole("link", { name: "Play", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Help" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
  // No token grid, tables, statistics blocks or leaderboard content.
  await expect(page.locator("main table, main .token-key, main dl, main svg")).toHaveCount(1); // the Play arrow only
  const words = (await page.locator("main").innerText()).split(/\s+/).filter(Boolean).length;
  expect(words).toBeLessThanOrEqual(25);
});

test("Help holds the detailed instructions", async ({ page }) => {
  await page.goto("/help");
  for (const name of [
    "How it works",
    "Scoring and the Focus Endurance Index",
    "After a miss",
    "Keyboard controls",
    "Practice and the daily challenge",
    "Accessibility",
  ]) {
    await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
  }
  await expect(page.getByText("FEI = Σ (tokens × time per token)")).toBeVisible();
  await expect(page.getByRole("rowheader", { name: "Backspace" })).toBeVisible();
  await page.getByRole("link", { name: "After a miss" }).click();
  await expect(page).toHaveURL(/#miss$/);
});

test("the brand is the name alone, with no symbol", async ({ page }) => {
  for (const path of ["/", "/help"]) {
    await page.goto(path);
    const mark = page.getByRole("link", { name: "SYNAPSE, home" });
    await expect(mark).toHaveText("SYNAPSE");
    await expect(mark.locator("svg")).toHaveCount(0);
  }
});

test("the launch word glitches through other scripts once, then settles on pattern", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const word = page.locator(".glitch-word > [data-active]");
  await expect(word).toHaveText("pattern.");
  const seen = new Set<string>();
  const start = Date.now();
  while (Date.now() - start < 6000) {
    seen.add((await word.textContent()) ?? "");
    await page.waitForTimeout(120);
  }
  expect(seen.size).toBeGreaterThanOrEqual(5);
  expect([...seen].some((t) => /[가-힯]/.test(t))).toBe(true); // Korean
  expect([...seen].some((t) => /[ऀ-ॿ]/.test(t))).toBe(true); // Devanagari
  // It stops within five seconds of starting and ends where it began.
  await expect(word).toHaveText("pattern.");
  await expect(word).not.toHaveAttribute("data-glitching", "true");
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("Hold the pattern.");
  await expect(page.locator(".glitch-word")).toHaveAttribute("aria-hidden", "true");
});

test("reduced motion keeps the launch word still", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const word = page.locator(".glitch-word > [data-active]");
  for (let i = 0; i < 12; i++) {
    await expect(word).toHaveText("pattern.");
    await page.waitForTimeout(250);
  }
});

test("the launch word does not move the Play button while it changes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const play = page.getByRole("link", { name: "Play", exact: true });
  const tops = new Set<number>();
  for (let i = 0; i < 30; i++) {
    tops.add(Math.round((await play.boundingBox())!.y));
    await page.waitForTimeout(150);
  }
  expect(tops.size).toBe(1);
});
