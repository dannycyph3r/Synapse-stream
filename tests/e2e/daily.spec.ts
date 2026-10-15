import { expect, test } from "@playwright/test";
import { utcDateKey } from "../../src/lib/game/daily";
import { bankedFei, comparisonRow, dailySequence, enter, label, resultsHeading, submit, waitForRecall, wrongFor } from "./helpers";

test.describe("daily challenge", () => {
  test("ranked run, validated posting, leaderboard, and no replay", async ({ page }) => {
    await page.goto("/play?mode=daily");
    await expect(page.getByText(`Daily · ${utcDateKey(new Date())} UTC`)).toBeVisible();
    await page.getByRole("button", { name: /Begin ranked run/ }).click();
    await waitForRecall(page);
    await enter(page, dailySequence(0));
    await submit(page);
    await expect(bankedFei(page)).toHaveText("00:04.5");
    await waitForRecall(page);
    const seq = dailySequence(1);
    await enter(page, [wrongFor(seq[0]!), ...seq.slice(1)]);
    await submit(page);

    await expect(resultsHeading(page)).toHaveText("Position 1 did not match.");
    // Ranked runs reveal the failed pattern too, after the answer is in.
    expect(await comparisonRow(page, "Your pattern")).toEqual([wrongFor(seq[0]!), ...seq.slice(1)].map(label));
    expect(await comparisonRow(page, "Correct pattern")).toEqual(seq.map(label));

    const name = page.getByRole("textbox", { name: "Name on the leaderboard" });
    await page.getByRole("button", { name: "Post score" }).click();
    await expect(page.getByText("Enter a name to show on the leaderboard.")).toBeVisible();
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(name).toBeFocused();
    await name.fill("<b>");
    await page.getByRole("button", { name: "Post score" }).click();
    await expect(page.getByText("Use only letters, numbers, spaces, dots, dashes or underscores.")).toBeVisible();
    await name.fill("Tester One");
    await page.getByRole("button", { name: "Post score" }).click();
    await expect(page.getByText("Posted to today's board.")).toBeVisible();
    await expect(page.getByText(/Rank #\d+/)).toBeVisible();
    await expect(page.getByText(/Preview server/)).toBeVisible();

    await page.getByRole("link", { name: "View the leaderboard" }).click();
    const row = page.getByRole("row", { name: /Tester One/ });
    await expect(row).toContainText("You");
    await expect(row).toContainText("00:04.5");
    await expect(page.getByRole("note")).toContainText("Preview leaderboard.");

    await page.goto("/play?mode=daily");
    await expect(page.getByRole("heading", { name: "Today's run is in." })).toBeVisible();
    await expect(page.getByText("Posted to today's board.")).toBeVisible();
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Daily challenge · done today" })).toBeVisible();
  });

  test("a reload mid-run records the interrupted run from its answers", async ({ page }) => {
    await page.goto("/play?mode=daily");
    await page.getByRole("button", { name: /Begin ranked run/ }).click();
    await waitForRecall(page);
    await enter(page, dailySequence(0));
    await submit(page);
    await expect(page.locator(".game-metrics dd").first()).toHaveText("02", { timeout: 10_000 });
    await page.reload();
    await expect(resultsHeading(page)).toHaveText("Run recorded");
    await expect(page.getByTestId("pattern-comparison")).toHaveCount(0);
    await expect(page.getByText(/interrupted by a reload/)).toBeVisible();
    await expect(page.getByText("00:04.5").first()).toBeVisible();
    // It cannot be restarted.
    await page.goto("/play?mode=daily");
    await expect(page.getByRole("heading", { name: "Today's run is in." })).toBeVisible();
  });

  test("leaving a ranked run asks first, and keep playing returns to the pause", async ({ page }) => {
    await page.goto("/play?mode=daily");
    await page.getByRole("button", { name: /Begin ranked run/ }).click();
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
  test("rejects forged or malformed runs and computes scores itself", async ({ request }) => {
    const dateKey = utcDateKey(new Date());
    const base = {
      dateKey,
      division: "spoken",
      playerId: "0b5e1c6a-2f4d-4c1e-9a7b-3d2c1b0a9f8e",
      displayName: "Api Probe",
    };
    const bad = await request.post("/api/leaderboard/submit", { data: { ...base, answers: [["circle"]] } });
    expect(bad.status()).toBe(422);

    const malformed = await request.post("/api/leaderboard/submit", {
      data: "not json",
      headers: { "content-type": "application/json" },
    });
    expect(malformed.status()).toBe(400);

    const forged = await request.post("/api/leaderboard/submit", {
      data: { ...base, answers: [[...dailySequence(0, "spoken")]], feiMs: 9_999_999 },
    });
    expect(forged.status()).toBe(201);
    const body = await forged.json();
    expect(body.entry.feiMs).toBe(4500);

    const again = await request.post("/api/leaderboard/submit", {
      data: { ...base, answers: [[...dailySequence(0, "spoken")], [...dailySequence(1, "spoken")]] },
    });
    expect(again.status()).toBe(409);

    const board = await (await request.get(`/api/leaderboard?division=spoken&date=${dateKey}`)).json();
    expect(JSON.stringify(board)).not.toContain(base.playerId);
  });
});
