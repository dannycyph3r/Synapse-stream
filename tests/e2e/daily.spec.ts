import { expect, test, type Page } from "@playwright/test";
import { utcDateKey } from "../../src/lib/game/daily";
import {
  comparisonRow,
  dailySequence,
  enter,
  label,
  resultsHeading,
  submit,
  waitForRecall,
  wrongFor,
} from "./helpers";

const nameField = (page: Page) => page.getByRole("textbox", { name: "Your name on the leaderboard" });

/** Plays a daily attempt: holds `held` rounds, then misses the next one. */
async function playAttempt(page: Page, attempt: number, held: number) {
  for (let i = 0; i < held; i++) {
    await waitForRecall(page);
    await enter(page, dailySequence(i, "standard", attempt));
    await submit(page);
  }
  await waitForRecall(page);
  const seq = dailySequence(held, "standard", attempt);
  await enter(page, [wrongFor(seq[0]!), ...seq.slice(1)]);
  await submit(page);
  await expect(resultsHeading(page)).toBeFocused({ timeout: 10_000 });
  return seq;
}

test.describe("daily challenge", () => {
  test("name first, automatic posting, a second attempt on new sequences, best one kept", async ({ page }) => {
    await page.goto("/play?mode=daily");
    await expect(page.getByRole("heading", { name: "Daily challenge" })).toBeVisible();
    await expect(page.getByText(`Daily · ${utcDateKey(new Date())} · 1/2`)).toBeVisible();

    // The name is asked for before play, and validated.
    const play = page.getByRole("button", { name: "Play attempt 1 of 2" });
    await play.click();
    await expect(page.getByText("Enter a name for the leaderboard.")).toBeVisible();
    await expect(nameField(page)).toBeFocused();
    await expect(nameField(page)).toHaveAttribute("aria-invalid", "true");
    await nameField(page).fill("<b>");
    await play.click();
    await expect(page.getByText("Use only letters, numbers, spaces, dots, dashes or underscores.")).toBeVisible();
    await nameField(page).fill("  Tester   One ");
    await play.click();

    // Attempt 1: hold one round (4.5 s), then miss.
    const missed = await playAttempt(page, 1, 1);
    await expect(resultsHeading(page)).toHaveText("Pattern broken.");
    expect(await comparisonRow(page, "Correct pattern")).toEqual(missed.map(label));
    // Posted with no form to fill in.
    const status = page.getByRole("status").filter({ hasText: "leaderboard" });
    await expect(page.getByText(/Your best run is on today's leaderboard at #\d+\./)).toBeVisible();
    await expect(status.first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Post score" })).toHaveCount(0);

    // Attempt 2 opens on its start screen with the name kept and the score to beat.
    await page.getByRole("button", { name: "Play attempt 2 of 2" }).click();
    await expect(page.getByRole("heading", { name: "Second attempt" })).toBeVisible();
    await expect(nameField(page)).toHaveValue("Tester One");
    await expect(page.getByText(/to beat: 00:04\.5/)).toBeVisible();
    await page.getByRole("button", { name: "Play attempt 2 of 2" }).click();

    // Attempt 2 runs on different sequences: hold two rounds (9.0 s), then miss.
    expect(dailySequence(0, "standard", 2)).not.toEqual(dailySequence(0, "standard", 1));
    await playAttempt(page, 2, 2);
    await expect(page.getByText(/Your best run is on today's leaderboard at #\d+\./)).toBeVisible();
    await expect(page.getByRole("button", { name: /Play attempt/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Practice" })).toBeVisible();

    // The board holds one row for this player: the better attempt.
    await page.getByRole("link", { name: "View leaderboard" }).click();
    const mine = page.getByRole("row", { name: /Tester One/ });
    await expect(mine).toHaveCount(1);
    await expect(mine).toContainText("You");
    await expect(mine).toContainText("00:09.0");

    // Today is done: both attempts listed, and the launch screen shows a check.
    await page.goto("/play?mode=daily");
    await expect(page.getByRole("heading", { name: "Done for today." })).toBeVisible();
    await expect(page.getByText("Attempt 1")).toBeVisible();
    await expect(page.getByText("Attempt 2")).toBeVisible();
    await page.goto("/");
    const link = page.getByRole("link", { name: /Daily challenge · done for today/ });
    await expect(link).toBeVisible();
    await expect(link.locator('svg[data-done="true"]')).toHaveCount(1);
  });

  test("the launch screen shows a globe, then attempts left", async ({ page }) => {
    await page.goto("/");
    const link = page.getByRole("link", { name: /^Daily challenge$/ });
    await expect(link.locator("svg.globe")).toHaveCount(1);

    await page.goto("/play?mode=daily");
    await nameField(page).fill("Globe Check");
    await page.getByRole("button", { name: "Play attempt 1 of 2" }).click();
    await playAttempt(page, 1, 0);
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Daily challenge · 1 attempt left/ })).toBeVisible();
  });

  test("an unreachable leaderboard keeps the run and posts on retry", async ({ page }) => {
    await page.route("**/api/leaderboard/submit", (route) => route.abort());
    await page.goto("/play?mode=daily");
    await nameField(page).fill("Offline Player");
    await page.getByRole("button", { name: "Play attempt 1 of 2" }).click();
    await playAttempt(page, 1, 1);
    await expect(page.getByText(/could not be reached/)).toBeVisible();

    await page.unroute("**/api/leaderboard/submit");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText(/Your best run is on today's leaderboard at #\d+\./)).toBeVisible();
  });

  test("a run that never posted is sent on the next visit", async ({ page }) => {
    await page.route("**/api/leaderboard/submit", (route) => route.abort());
    await page.goto("/play?mode=daily");
    await nameField(page).fill("Later Poster");
    await page.getByRole("button", { name: "Play attempt 1 of 2" }).click();
    await playAttempt(page, 1, 1);
    await expect(page.getByText(/could not be reached/)).toBeVisible();
    await page.unroute("**/api/leaderboard/submit");

    const posted = page.waitForResponse((r) => r.url().includes("/api/leaderboard/submit") && r.status() < 300);
    await page.goto("/play?mode=daily");
    await posted;
    await page.goto("/leaderboard");
    await expect(page.getByRole("row", { name: /Later Poster/ })).toContainText("00:04.5");
  });

  test("a reload mid-attempt records it, posts it, and leaves the second attempt", async ({ page }) => {
    await page.goto("/play?mode=daily");
    await nameField(page).fill("Reloader");
    await page.getByRole("button", { name: "Play attempt 1 of 2" }).click();
    await waitForRecall(page);
    await enter(page, dailySequence(0));
    await submit(page);
    await expect(page.locator(".game-metrics dd").first()).toHaveText("02", { timeout: 10_000 });
    await page.reload();
    await expect(resultsHeading(page)).toHaveText("Run recorded");
    await expect(page.getByText(/Your best run is on today's leaderboard/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Play attempt 2 of 2" })).toBeVisible();
  });

  test("leaving a ranked attempt asks first, and keep playing returns to the pause", async ({ page }) => {
    await page.goto("/play?mode=daily");
    await nameField(page).fill("Leaver");
    await page.getByRole("button", { name: "Play attempt 1 of 2" }).click();
    await expect(page.locator(".stage svg")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Exit" }).click();
    const confirm = page.getByRole("dialog", { name: "End today's ranked run?" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Keep playing" }).click();
    await expect(page.getByRole("dialog", { name: "Paused" })).toBeVisible();
    await page.getByRole("button", { name: "End run" }).click();
    await page.getByRole("dialog", { name: "End today's ranked run?" }).getByRole("button", { name: "End run" }).click();
    await expect(resultsHeading(page)).toHaveText("Run ended");
  });
});

test.describe("leaderboard API", () => {
  test("rejects forged or malformed runs, computes scores itself, and keeps the best of two", async ({ request }) => {
    const dateKey = utcDateKey(new Date());
    const base = {
      dateKey,
      division: "spoken",
      playerId: "0b5e1c6a-2f4d-4c1e-9a7b-3d2c1b0a9f8e",
      displayName: "Api Probe",
    };
    const bad = await request.post("/api/leaderboard/submit", { data: { ...base, attempt: 1, answers: [["circle"]] } });
    expect(bad.status()).toBe(422);

    const malformed = await request.post("/api/leaderboard/submit", {
      data: "not json",
      headers: { "content-type": "application/json" },
    });
    expect(malformed.status()).toBe(400);

    const forged = await request.post("/api/leaderboard/submit", {
      data: { ...base, attempt: 1, answers: [[...dailySequence(0, "spoken")]], feiMs: 9_999_999 },
    });
    expect(forged.status()).toBe(201);
    expect((await forged.json()).entry.feiMs).toBe(4500);

    const resend = await request.post("/api/leaderboard/submit", {
      data: { ...base, attempt: 1, answers: [[...dailySequence(0, "spoken")], [...dailySequence(1, "spoken")]] },
    });
    expect((await resend.json()).outcome).toBe("unchanged");

    const second = await request.post("/api/leaderboard/submit", {
      data: { ...base, attempt: 2, answers: [[...dailySequence(0, "spoken", 2)], [...dailySequence(1, "spoken", 2)]] },
    });
    expect(await second.json()).toMatchObject({ outcome: "improved", attempts: 2, bestFeiMs: 9000 });

    const third = await request.post("/api/leaderboard/submit", { data: { ...base, attempt: 3, answers: [[...dailySequence(0, "spoken")]] } });
    expect(third.status()).toBe(400);

    const board = await (await request.get(`/api/leaderboard?division=spoken&date=${dateKey}`)).json();
    expect(JSON.stringify(board)).not.toContain(base.playerId);
  });
});
