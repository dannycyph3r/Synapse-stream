import { expect, test } from "@playwright/test";
import {
  enter,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  practiceSequence,
  startPractice,
  submit,
  waitForRecall,
  wrongFor,
} from "./helpers";

const PAGES = ["/", "/help", "/leaderboard", "/stats", "/settings", "/play?mode=practice", "/play?mode=daily"];

for (const scheme of ["light", "dark"] as const) {
  test(`every page passes axe in ${scheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expectNoAxeViolations(page, `${scheme} ${path}`);
    }
  });

  test(`every game state passes axe in ${scheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await startPractice(page);
    await expect(page.locator(".stage svg")).toBeVisible({ timeout: 10_000 });
    await expectNoAxeViolations(page, "observing");
    await waitForRecall(page);
    await enter(page, practiceSequence(0).slice(0, 2));
    await expectNoAxeViolations(page, "recalling");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Paused" })).toBeVisible();
    await expectNoAxeViolations(page, "paused");
    await page.getByRole("button", { name: "Resume" }).click();
    await enter(page, [wrongFor(practiceSequence(0)[2]!)]);
    await submit(page);
    await expect(page.getByTestId("pattern-comparison")).toBeVisible();
    await expectNoAxeViolations(page, "failure results");
  });
}

test("leaderboard error state is announced and recoverable", async ({ page }) => {
  await page.route("**/api/leaderboard?**", (route) => route.abort());
  await page.goto("/leaderboard");
  await expect(page.getByRole("alert").filter({ hasText: "could not be reached" })).toBeVisible();
  await expectNoAxeViolations(page, "leaderboard error");
  await page.unroute("**/api/leaderboard?**");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Preview leaderboard.")).toBeVisible();
});

test.describe("narrow screens and zoom", () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test("pages reflow at 320 px (1280 px at 400% zoom) with no sideways scroll", async ({ page }) => {
    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expectNoHorizontalOverflow(page, path);
    }
  });
});

const VIEWPORTS = [
  { name: "narrow phone", width: 320, height: 568 },
  { name: "standard phone", width: 390, height: 844 },
  { name: "phone landscape", width: 844, height: 390 },
  { name: "tablet", width: 768, height: 1024 },
];

for (const vp of VIEWPORTS) {
  test.describe(vp.name, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: true });

    test("recall fits the screen with no scrolling and large touch targets", async ({ page }) => {
      await startPractice(page);
      await waitForRecall(page);
      await expectNoHorizontalOverflow(page, "recall");
      const { scrollH, innerH, stageBottom } = await page.evaluate(() => ({
        scrollH: document.documentElement.scrollHeight,
        innerH: window.innerHeight,
        stageBottom: document.querySelector(".stage")!.getBoundingClientRect().bottom,
      }));
      expect(scrollH, "page height during recall").toBeLessThanOrEqual(innerH);
      expect(stageBottom).toBeLessThanOrEqual(innerH);
      const submitBox = await page.getByRole("button", { name: "Submit" }).boundingBox();
      expect(submitBox!.y + submitBox!.height).toBeLessThanOrEqual(innerH);
      const sizes = await page.locator(".token-key").evaluateAll((els) =>
        els.map((e) => e.getBoundingClientRect()).map((r) => Math.min(r.width, r.height)),
      );
      expect(sizes).toHaveLength(8);
      for (const size of sizes) expect(size).toBeGreaterThanOrEqual(44);
      await page.locator(".token-key").first().tap();
      await expect(page.getByRole("list", { name: "Your answer, 1 of 3 placed" })).toBeVisible();
    });

    test("the launch screen puts Begin above the fold", async ({ page }) => {
      await page.goto("/");
      const begin = await page.getByRole("link", { name: "Begin", exact: true }).boundingBox();
      const innerH = await page.evaluate(() => window.innerHeight);
      expect(begin!.y + begin!.height).toBeLessThanOrEqual(innerH);
      expect(begin!.height).toBeGreaterThanOrEqual(48);
      await expectNoHorizontalOverflow(page, "launch");
    });

    test("a nine-token comparison fits without sideways scrolling", async ({ page }) => {
      await startPractice(page, "&level=deep");
      await waitForRecall(page);
      const seq = practiceSequence(0, "deep");
      expect(seq).toHaveLength(9);
      await enter(page, [...seq.slice(0, 8), wrongFor(seq[8]!)]);
      await submit(page);
      await expect(page.getByTestId("pattern-comparison").getByRole("table")).toHaveCount(2);
      await expectNoHorizontalOverflow(page, "comparison");
      const right = await page.getByTestId("pattern-comparison").evaluate((el) =>
        Math.max(...[...el.querySelectorAll("table")].map((t) => t.getBoundingClientRect().right)),
      );
      expect(right).toBeLessThanOrEqual(vp.width);
    });
  });
}

test("reduced motion removes animation but keeps timing", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const scale = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--motion-scale").trim());
  expect(scale).toBe("0");
  await startPractice(page);
  const glyph = page.locator(".stage-glyph");
  await expect(glyph).toBeVisible({ timeout: 10_000 });
  expect(await glyph.evaluate((el) => getComputedStyle(el).animationDuration)).toBe("0s");
});

test("the motion setting overrides the system preference", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("radio", { name: /Reduce/ }).check();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
});

test("theme setting persists across reloads", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("radio", { name: /Dark/ }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(15, 15, 14)");
});

test("the sound switch is a real switch and starts off", async ({ page }) => {
  await page.goto("/settings");
  const sw = page.getByRole("switch", { name: "Sound" });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
});

test("corrupt local storage never breaks the app", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("synapse-stream:v1", '{"settings":{"theme":42},"stats":"oops","recent":[1,2,3]');
      sessionStorage.setItem("seeded", "1");
    }
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Hold the pattern." })).toBeVisible();
  // Records saved under the old product name are migrated to the new key.
  expect(await page.evaluate(() => [localStorage.getItem("synapse-stream:v1"), !!localStorage.getItem("synapse:v1")])).toEqual([
    null,
    true,
  ]);
  await page.goto("/stats");
  await expect(page.getByText("No runs yet.")).toBeVisible();
  await expect(page.getByText("No records yet.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("skip link moves focus to the main content", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
});
