import { expect, test } from "@playwright/test";
import { buildChallenge, practiceConfig } from "../../src/lib/game/engine";
import { FAILURE_QUOTES, SUCCESS_QUOTES } from "../../src/lib/quotes";
import {
  SEED,
  bankedFei,
  comparisonRow,
  enter,
  failRound,
  keyFor,
  label,
  practiceSequence,
  resultsHeading,
  roundNumber,
  startPractice,
  submit,
  tokenButton,
  waitForRecall,
  wrongFor,
} from "./helpers";

const successTexts = new Set(SUCCESS_QUOTES.map((q) => q.text));
const failureTexts = new Set(FAILURE_QUOTES.map((q) => q.text));

test.describe("practice game loop", () => {
  test("a correct round banks 4.5 s; a wrong order ends the run and reveals both patterns", async ({ page }) => {
    await startPractice(page);
    await expect(page.locator(".stage svg")).toBeVisible({ timeout: 10_000 });
    // While observing, the stage carries no token names.
    const stageText = await page.locator(".stage").innerText();
    for (const t of practiceSequence(0)) expect(stageText).not.toContain(label(t));
    // The correct pattern is not in the page before an answer is submitted.
    await expect(page.getByTestId("pattern-comparison")).toHaveCount(0);

    await waitForRecall(page);
    await expect(page.locator(".stage svg")).toHaveCount(0);
    await enter(page, practiceSequence(0));
    await submit(page);
    await expect(bankedFei(page)).toHaveText("00:04.5");

    await waitForRecall(page);
    const seq = practiceSequence(1);
    const reversed = [...seq].reverse();
    const answer = reversed.join() === seq.join() ? [wrongFor(seq[0]!), ...seq.slice(1)] : reversed;
    await enter(page, answer);
    await submit(page);

    const heading = resultsHeading(page);
    await expect(heading).toBeFocused();
    await expect(heading).toHaveText(/did not match\.$/);
    expect(await comparisonRow(page, "Your pattern")).toEqual(answer.map(label));
    expect(await comparisonRow(page, "Correct pattern")).toEqual(seq.map(label));
    // The failed round adds nothing: FEI is still the single held round.
    await expect(page.getByText("00:04.5").first()).toBeVisible();
    await expect(page.getByText("Personal best", { exact: true })).toBeVisible();
  });

  test("names the mismatched position in words and marks it structurally", async ({ page }) => {
    await startPractice(page);
    await waitForRecall(page);
    const seq = practiceSequence(0);
    await failRound(page, seq, 2);
    await expect(resultsHeading(page)).toHaveText("Position 2 did not match.");
    const header = page.getByTestId("pattern-comparison").getByRole("columnheader", { name: /Position 2/ });
    await expect(header).toHaveAccessibleName("Position 2, did not match");
    await expect(header).toHaveAttribute("data-miss", "true");
    await expect(page.getByRole("columnheader", { name: /Position 1/ })).not.toHaveAttribute("data-miss", "true");
    await expect(page.getByText(`At 2 you entered ${label(wrongFor(seq[1]!))}; the pattern had ${label(seq[1]!)}.`)).toBeVisible();
    // A different line follows a failed round, from the failure pool.
    const quote = (await page.getByTestId("failure-quote").innerText()).trim();
    expect(failureTexts.has(quote)).toBe(true);
    expect(successTexts.has(quote)).toBe(false);
  });

  test("keyboard: play, then reach the comparison and every results action", async ({ page }) => {
    await page.goto(`/play?mode=practice&seed=${SEED}`);
    await page.getByRole("button", { name: "Begin", exact: true }).focus();
    await page.keyboard.press("Enter");
    await waitForRecall(page);

    const seq = practiceSequence(0);
    for (const t of seq) await page.keyboard.press(keyFor(t));
    await page.keyboard.press("Backspace");
    await expect(page.getByRole("list", { name: /2 of 3 placed/ })).toBeVisible();
    await page.keyboard.press(keyFor(seq[2]!));
    await page.keyboard.press("Enter");
    await expect(bankedFei(page)).toHaveText("00:04.5");

    await page.keyboard.press("Escape");
    const dialog = page.getByRole("dialog", { name: "Paused" });
    await expect(dialog.getByRole("button", { name: "Resume" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await waitForRecall(page);

    const next = practiceSequence(1);
    for (const t of [wrongFor(next[0]!), ...next.slice(1)]) await page.keyboard.press(keyFor(t));
    await page.keyboard.press("Enter");
    await expect(resultsHeading(page)).toBeFocused();
    // The comparison is real table markup, readable cell by cell.
    await expect(page.getByRole("table").first()).toHaveAccessibleName(/Your pattern compared with the correct pattern/);
    await expect(page.getByRole("rowheader", { name: "Correct pattern" })).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Play again" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Home", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Share" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Enter");
    await expect(page.locator(".game-root")).toBeVisible();
  });

  test("undo, clear and an incomplete submission", async ({ page }) => {
    await startPractice(page);
    await waitForRecall(page);
    const seq = practiceSequence(0);
    await enter(page, seq.slice(0, 2));
    await expect(page.getByRole("list", { name: "Your answer, 2 of 3 placed" })).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("list", { name: "Your answer, 1 of 3 placed" })).toBeVisible();
    await page.getByRole("button", { name: "Clear" }).click();
    await expect(page.getByRole("list", { name: "Your answer, 0 of 3 placed" })).toBeVisible();

    await enter(page, seq.slice(0, 1));
    await expect(page.getByRole("button", { name: "Submit" })).toHaveAttribute("aria-disabled", "true");
    await page.getByRole("button", { name: "Submit" }).click({ force: true });
    await expect(page.locator("#submit-hint")).toHaveText("2 of 3 positions left.");
    await expect(bankedFei(page)).toHaveText("00:00.0");

    await enter(page, [...seq.slice(1), seq[0]!]);
    await expect(page.getByRole("list", { name: "Your answer, 3 of 3 placed" })).toBeVisible();
    await submit(page);
    await expect(bankedFei(page)).toHaveText("00:04.5");
  });

  test("double-tapping Submit scores a round once", async ({ page }) => {
    await startPractice(page);
    await waitForRecall(page);
    await enter(page, practiceSequence(0));
    await page.getByRole("button", { name: "Submit" }).dblclick();
    await expect(bankedFei(page)).toHaveText("00:04.5");
    await page.waitForTimeout(400);
    await expect(bankedFei(page)).toHaveText("00:04.5");
    await expect(roundNumber(page)).toHaveText("02");
  });

  test("a short line follows each held round, inside the stage, without moving the keypad", async ({ page }) => {
    await startPractice(page);
    await waitForRecall(page);
    const keypadTop = await page.locator(".game-keypad").evaluate((el) => el.getBoundingClientRect().top);
    await enter(page, practiceSequence(0));
    await submit(page);
    const first = page.getByTestId("round-quote");
    await expect(first).toBeVisible();
    const q1 = (await first.innerText()).trim();
    expect(successTexts.has(q1)).toBe(true);
    expect(await page.locator(".game-keypad").evaluate((el) => el.getBoundingClientRect().top)).toBe(keypadTop);
    // During the beat the strip already shows the coming round.
    await expect(roundNumber(page)).toHaveText("02");

    await waitForRecall(page);
    await expect(page.getByTestId("round-quote")).toHaveCount(0);
    await enter(page, practiceSequence(1));
    await submit(page);
    const q2 = (await page.getByTestId("round-quote").innerText()).trim();
    expect(successTexts.has(q2)).toBe(true);
    expect(q2).not.toBe(q1);
    // It is spoken too: the polite live region carries the line.
    await expect(page.getByRole("status")).toContainText(q2);
  });

  test("pausing hides the sequence and adds nothing", async ({ page }) => {
    await startPractice(page);
    await expect(page.locator(".stage svg")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Pause" }).click();
    await expect(page.getByRole("dialog", { name: "Paused" })).toBeVisible();
    await expect(page.locator(".stage svg")).toHaveCount(0);
    await page.waitForTimeout(2000);
    await page.getByRole("button", { name: "Resume" }).click();
    await waitForRecall(page);
    await enter(page, practiceSequence(0));
    await submit(page);
    await expect(bankedFei(page)).toHaveText("00:04.5");
  });

  test("hiding the tab pauses the run", async ({ page }) => {
    await startPractice(page);
    await expect(page.locator(".stage svg")).toBeVisible({ timeout: 10_000 });
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(page.getByRole("dialog", { name: "Paused" })).toBeVisible();
  });

  test("play again after a failure starts a clean run with no comparison", async ({ page }) => {
    await startPractice(page);
    await waitForRecall(page);
    await enter(page, practiceSequence(0));
    await submit(page);
    await waitForRecall(page);
    await failRound(page, practiceSequence(1));
    await expect(page.getByTestId("pattern-comparison")).toBeVisible();
    await page.getByRole("button", { name: "Play again" }).click();

    await expect(page.getByTestId("pattern-comparison")).toHaveCount(0);
    await expect(bankedFei(page)).toHaveText("00:00.0");
    await expect(roundNumber(page)).toHaveText("01");
    await waitForRecall(page);
    await enter(page, practiceSequence(0));
    await submit(page);
    await expect(bankedFei(page)).toHaveText("00:04.5");
  });

  test("returning players go straight from Begin to the countdown", async ({ page }) => {
    await startPractice(page);
    await page.getByRole("button", { name: "Exit" }).click();
    await page.goto("/");
    await page.getByRole("link", { name: "Begin", exact: true }).click();
    await expect(page.locator(".game-root")).toBeVisible();
    await expect(page.getByRole("button", { name: "Begin", exact: true })).toHaveCount(0);
    await waitForRecall(page);
  });

  test("exiting practice shows the banked result without a comparison", async ({ page }) => {
    await startPractice(page);
    await waitForRecall(page);
    await enter(page, practiceSequence(0));
    await submit(page);
    await page.getByRole("button", { name: "Exit" }).click();
    await expect(resultsHeading(page)).toHaveText("Run ended");
    await expect(page.getByTestId("pattern-comparison")).toHaveCount(0);
    await expect(page.getByText("00:04.5").first()).toBeVisible();
  });

  test("statistics record the run and the launch screen shows the best", async ({ page }) => {
    await startPractice(page);
    await waitForRecall(page);
    await enter(page, practiceSequence(0));
    await submit(page);
    await page.getByRole("button", { name: "Exit" }).click();
    await page.getByRole("link", { name: "Home", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Hold the pattern." })).toBeVisible();
    await expect(page.getByText(/Best · Foundation/)).toContainText("00:04.5");
    await page.goto("/stats");
    await expect(page.getByRole("table", { name: "Personal records for each mode" })).toContainText("Practice · Foundation · Visual");
    await expect(page.getByRole("table", { name: /Recent runs/ })).toContainText("00:04.5");
  });

  test("token buttons stay unpressable outside recall", async ({ page }) => {
    await startPractice(page);
    await expect(page.locator(".stage svg")).toBeVisible({ timeout: 10_000 });
    const key = tokenButton(page, "circle");
    expect(await key.evaluate((el) => el.closest("[inert]") !== null)).toBe(true);
    await key.evaluate((el) => (el as HTMLButtonElement).focus());
    await expect(key).not.toBeFocused();
    await waitForRecall(page);
    expect(await key.evaluate((el) => el.closest("[inert]") !== null)).toBe(false);
  });
});

test.describe("spoken presentation", () => {
  test("speaks each token in order and is played in its own division", async ({ page }) => {
    await page.addInitScript(() => {
      const spoken: string[] = [];
      (window as unknown as { __spoken: string[] }).__spoken = spoken;
      class FakeUtterance {
        text: string;
        lang = "";
        rate = 1;
        constructor(text: string) {
          this.text = text;
        }
      }
      Object.defineProperty(window, "SpeechSynthesisUtterance", { value: FakeUtterance, configurable: true });
      Object.defineProperty(window, "speechSynthesis", {
        value: { speak: (u: FakeUtterance) => spoken.push(u.text), cancel: () => {}, getVoices: () => [] },
        configurable: true,
      });
    });
    await page.goto("/settings");
    await page.getByRole("radio", { name: /Spoken/ }).check();
    await page.goto(`/play?mode=practice&seed=${SEED}`);
    await page.getByRole("button", { name: "Begin", exact: true }).click();
    await expect(page.getByText(/Practice · Foundation · Spoken · Seed E2E/).first()).toBeVisible();
    await waitForRecall(page);
    const seq = buildChallenge(practiceConfig("spoken", "foundation", "unused", SEED), 0).sequence;
    const spoken = await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
    expect(spoken).toEqual(seq.map(label));
    await enter(page, seq);
    await submit(page);
    await expect(bankedFei(page)).toHaveText("00:04.5");
  });

  test("visual mode never puts token names in the live regions while observing", async ({ page }) => {
    await startPractice(page);
    const status = page.getByRole("status");
    for (let i = 0; i < 3; i++) {
      await expect(page.locator(".stage svg")).toBeVisible({ timeout: 10_000 });
      const text = (await status.textContent()) ?? "";
      for (const t of practiceSequence(0)) expect(text).not.toContain(label(t));
      await page.waitForTimeout(1500);
    }
  });
});
