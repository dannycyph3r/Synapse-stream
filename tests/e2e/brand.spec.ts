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
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hold the pattern.");
  await expect(page.getByRole("link", { name: "Begin", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Help" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
  // No token grid, tables, statistics blocks or leaderboard content.
  await expect(page.locator("main table, main .token-key, main dl, main svg")).toHaveCount(1); // the Begin arrow only
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
