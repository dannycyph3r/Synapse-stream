import { expect, test } from "@playwright/test";
import { buildChallenge, practiceConfig } from "../../src/lib/game/engine";
import {
  SEED,
  bankedFei,
  enter,
  keyFor,
  label,
  practiceSequence,
  startPractice,
  submit,
  tokenButton,
  waitForRecall,
  wrongFor,
} from "./helpers";

test.describe("practice game loop", () => {
  test("a correct challenge banks 4.5 s, a wrong order ends the run", async ({ page }) => {
    await startPractice(page);
    await expect(page.locator(".stage")).toBeVisible();

    // While observing, the stage carries no token text at all.
    await expect(page.locator(".stage svg")).toBeVisible({ timeout: 10_000 });
    const stageText = await page.locator(".stage").innerText();
    for (const t of practiceSequence(0)) expect(stageText).not.toContain(label(t));

    await waitForRecall(page);
    // Once recall opens, no glyph remains on the stage.
    await expect(page.locator(".stage svg")).toHaveCount(0);

    await enter(page, practiceSequence(0));
    await submit(page);
    await expect(bankedFei(page)).toHaveText("00:04.5");

    await waitForRecall(page);
    const seq = practiceSequence(1);
    // The right tokens in the wrong order, or a wrong first token if reversal changes nothing.
    const reversed = [...seq].reverse();
    const answer = reversed.join() === seq.join() ? [wrongFor(seq[0]!), ...seq.slice(1)] : reversed;
    await enter(page, answer);
    await submit(page);

    await expect(page.getByRole("heading", { name: "Run complete" })).toBeFocused();
    await expect(page.getByText("The last sequence did not match")).toBeVisible();
    await expect(page.getByText("00:04.5").first()).toBeVisible();
    await expect(page.getByText("Personal best", { exact: true })).toBeVisible();
    await page.getByText("Review the final sequence").click();
    await expect(page.getByRole("cell", { name: "Mismatch" }).first()).toBeVisible();
  });

  test("keyboard only: digits, Backspace, Enter, Escape", async ({ page }) => {
    await page.goto("/play?mode=practice&seed=E2E");
    const begin = page.getByRole("button", { name: /Begin session/ });
    await begin.focus();
    await page.keyboard.press("Enter");
    await waitForRecall(page);

    const seq = practiceSequence(0);
    for (const t of seq) await page.keyboard.press(keyFor(t));
    await page.keyboard.press("Backspace");
    await expect(page.getByRole("list", { name: /2 of 3 placed/ })).toBeVisible();
    await page.keyboard.press(keyFor(seq[2]!));
    // Focus sits on a token key; with the answer full, Enter submits.
    await page.keyboard.press("Enter");
    await expect(bankedFei(page)).toHaveText("00:04.5");

    await page.keyboard.press("Escape");
    const dialog = page.getByRole("dialog", { name: "Paused" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Resume" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await waitForRecall(page);
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
    // Submit is aria-disabled until the answer is full (still focusable, so it
    // can explain itself). Playwright treats aria-disabled as not actionable,
    // so the press is forced to prove the app itself ignores it.
    await expect(page.getByRole("button", { name: "Submit" })).toHaveAttribute("aria-disabled", "true");
    await page.getByRole("button", { name: "Submit" }).click({ force: true });
    // Still recalling, nothing scored.
    await expect(page.getByText("2 of 3 positions left.")).toBeVisible();
    await expect(bankedFei(page)).toHaveText("00:00.0");

    // A fourth token is refused once the answer is full.
    await enter(page, [...seq.slice(1), seq[0]!]);
    await expect(page.getByRole("list", { name: "Your answer, 3 of 3 placed" })).toBeVisible();
    await submit(page);
    await expect(bankedFei(page)).toHaveText("00:04.5");
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

  test("play again starts a clean run", async ({ page }) => {
    await startPractice(page);
    await waitForRecall(page);
    await enter(page, practiceSequence(0));
    await submit(page);
    await waitForRecall(page);
    const seq = practiceSequence(1);
    await enter(page, [wrongFor(seq[0]!), ...seq.slice(1)]);
    await submit(page);
    await page.getByRole("button", { name: "Play again" }).click();

    await expect(bankedFei(page)).toHaveText("00:00.0");
    await expect(page.locator("dl").filter({ hasText: "Streak" }).locator("dd").nth(3)).toHaveText("00");
    // Same custom seed, so the first sequence repeats and can be solved again.
    await waitForRecall(page);
    await enter(page, practiceSequence(0));
    await submit(page);
    await expect(bankedFei(page)).toHaveText("00:04.5");
  });

  test("exiting practice shows the banked result", async ({ page }) => {
    await startPractice(page);
    await waitForRecall(page);
    await enter(page, practiceSequence(0));
    await submit(page);
    await page.getByRole("button", { name: "Exit" }).click();
    await expect(page.getByRole("heading", { name: "Run complete" })).toBeVisible();
    await expect(page.getByText("You ended the run.")).toBeVisible();
    await expect(page.getByText("00:04.5").first()).toBeVisible();
  });

  test("the stats page records the run and the dashboard shows it", async ({ page }) => {
    await startPractice(page);
    await waitForRecall(page);
    await enter(page, practiceSequence(0));
    await submit(page);
    await page.getByRole("button", { name: "Exit" }).click();
    await page.getByRole("link", { name: "Dashboard" }).first().click();
    await expect(page.getByRole("heading", { name: /Enter the stream/ })).toBeVisible();
    await expect(page.getByRole("table", { name: /Recent runs/ })).toContainText("00:04.5");
    await page.goto("/stats");
    await expect(page.getByRole("table", { name: "Personal records for each mode" })).toContainText("Practice · Foundation · Visual");
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
    // Record utterances instead of producing audio, so the test can check the channel.
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
    await page.goto("/play?mode=practice&seed=E2E");
    await expect(page.getByText(/Practice · Foundation · Spoken · Seed E2E/)).toBeVisible();
    await page.getByRole("button", { name: /Begin session/ }).click();
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
