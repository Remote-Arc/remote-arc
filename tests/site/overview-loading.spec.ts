import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

// The local preview answers /api/* inside the page, so page.route cannot delay
// it. This wraps whatever fetch the page installs and holds the Overview's
// data requests until the test releases them.
async function holdOverviewData(page: Page) {
  await page.addInitScript(() => {
    let release = () => {};
    let gate = Promise.resolve();
    const state = {
      waiting: 0,
      hold: () => {
        gate = new Promise<void>((resolve) => (release = resolve));
      },
      release: () => release(),
    };
    state.hold();
    Object.assign(window, { __overviewGate: state });
    let current = window.fetch;
    Object.defineProperty(window, "fetch", {
      configurable: true,
      get: () => current,
      set: (next: typeof fetch) => {
        current = async (input, init) => {
          const raw = input instanceof Request ? input.url : String(input);
          const path = new URL(raw, location.origin).pathname;
          if (path === "/api/status" || path === "/api/automations") {
            state.waiting += 1;
            await gate;
            state.waiting -= 1;
          }
          return next(input, init);
        };
      },
    });
  });
}

type Gate = { waiting: number; hold: () => void; release: () => void };
const release = (page: Page) =>
  page.evaluate(() => (window as unknown as { __overviewGate: Gate }).__overviewGate.release());
const hold = (page: Page) =>
  page.evaluate(() => (window as unknown as { __overviewGate: Gate }).__overviewGate.hold());
const waiting = (page: Page) =>
  page.evaluate(() => (window as unknown as { __overviewGate: Gate }).__overviewGate.waiting);

// Every card on the Overview, top to bottom. The second is the usage banner
// or its placeholder.
const CARDS = [
  ".firstRunCard",
  ".usageConversion, .overviewSkeletonBlock",
  ".overviewStatusCard:nth-child(1)",
  ".overviewStatusCard:nth-child(2)",
  ".overviewStatusCard:nth-child(3)",
  ".overviewStatusCard:nth-child(4)",
  ".overviewQuickCard",
  ".overviewAttentionCard",
  ".overviewDevicesPanel",
  ".overviewActivityPanel",
];

type Box = { x: number; y: number; width: number; height: number } | null;
const boxes = (page: Page, selectors: string[]) =>
  page.evaluate(
    (selectors) =>
      selectors.map((selector): Box => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return {
          x: rect.x + scrollX,
          y: rect.y + scrollY,
          width: rect.width,
          height: rect.height,
        };
      }),
    selectors,
  );

function expectSameBoxes(
  selectors: string[],
  loading: Box[],
  loaded: Box[],
  keys: Array<"x" | "y" | "width" | "height"> = ["x", "y", "width", "height"],
) {
  selectors.forEach((selector, index) => {
    const before = loading[index] ?? null;
    const after = loaded[index] ?? null;
    expect(before === null, selector + " is present in both states").toBe(after === null);
    if (!before || !after) return;
    for (const key of keys)
      expect(Math.abs(before[key] - after[key]), selector + " " + key).toBeLessThanOrEqual(1);
  });
}

// The banner spans the same column as the status cards, never wider.
async function expectInColumn(page: Page, selector: string) {
  const [banner, grid] = await boxes(page, [selector, ".overviewStatusGrid"]);
  expect(banner && grid, selector + " and the status cards").toBeTruthy();
  expect(Math.abs(banner!.x - grid!.x), selector + " left edge").toBeLessThanOrEqual(1);
  expect(Math.abs(banner!.width - grid!.width), selector + " width").toBeLessThanOrEqual(1);
}

async function expectLoading(page: Page) {
  await expect(page.locator(".overviewStatusGrid")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator(".overviewMainGrid")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator(".overviewSkeleton").first()).toBeVisible();
  await expect(page.locator(".overviewLoadingStatus")).toHaveText(
    /Loading your overview|正在加载概览/,
  );
  // No made-up zeros while the counts are unknown.
  await expect(page.locator(".overviewStatusCard").first().locator("strong")).toHaveText("");
  // Placeholders are hidden from screen readers; only the status speaks.
  expect(
    await page
      .locator(".overviewSkeleton")
      .evaluateAll((items) => items.every((item) => item.closest("[aria-hidden='true']"))),
  ).toBe(true);
  // The suite runs with reduced motion: the placeholders stay still.
  expect(
    await page
      .locator(".overviewSkeleton")
      .first()
      .evaluate((item) => getComputedStyle(item).animationName),
  ).toBe("none");
}

async function expectLoaded(page: Page) {
  await expect(page.locator(".overviewStatusGrid")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".overviewQuickGrid")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".overviewSkeleton")).toHaveCount(0);
  await expect(page.locator(".overviewLoadingStatus")).toHaveText("");
}

test("Overview placeholders take the exact space of the cards that replace them", async ({
  page,
}) => {
  await holdOverviewData(page);
  await page.goto("/dashboard/connect/overview");
  await expectLoading(page);
  // With nothing recorded, the pairing guide waits for the data. This account
  // has a computer, so it never appears.
  await expect(page.locator(".firstRunCard")).toHaveCount(0);
  await release(page);
  await expectLoaded(page);
  await expect(page.locator(".firstRunCard")).toHaveCount(0);
  // The Overview records its layout for the next visit on this browser.
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage).some((key) => key.startsWith("remotearc.overview.layout:")),
      ),
    )
    .toBe(true);

  await page.reload();
  await expectLoading(page);
  // The preview account is near its monthly limit, so the banner has a placeholder.
  await expect(page.locator(".overviewSkeletonBlock")).toBeVisible();
  await expectInColumn(page, ".overviewSkeletonBlock");
  await expect(page.locator(".overviewDeviceList .overviewSkeletonRow").first()).toBeVisible();
  await expect(page.locator(".activityList .overviewSkeletonRow").first()).toBeVisible();
  const loading = await boxes(page, CARDS);
  await release(page);
  await expectLoaded(page);
  await expect(page.locator(".usageConversion")).toBeVisible();
  await expectInColumn(page, ".usageConversion");
  await expect(page.locator(".overviewDeviceRow:not(.empty)").first()).toBeVisible();
  expectSameBoxes(CARDS, loading, await boxes(page, CARDS));

  // A background refresh keeps the real content on screen while it waits.
  await hold(page);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => waiting(page)).toBeGreaterThan(0);
  await expect(page.locator(".overviewStatusGrid")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".overviewSkeleton")).toHaveCount(0);
  await expect(page.locator(".overviewStatusCard").first().locator("strong")).toHaveText(
    /\d+ \/ \d+/,
  );
  await release(page);
});

test("The pairing guide waits for the data and appears only for a new account", async ({
  page,
}) => {
  await holdOverviewData(page);
  await page.goto("/dashboard/connect/overview?demo=first-run");
  const statusCards = CARDS.filter((selector) => selector.startsWith(".overviewStatusCard"));
  // Both on a first visit and on a return visit, the guide never shows before
  // the data says this account has no computer.
  for (const visit of ["first", "return"]) {
    if (visit === "return") await page.reload();
    await expectLoading(page);
    await expect(page.locator(".firstRunCard"), visit + " visit").toHaveCount(0);
    const loadingCards = await boxes(page, statusCards);
    await release(page);
    await expectLoaded(page);
    await expect(page.locator(".firstRunCard"), visit + " visit").toBeVisible();
    // The guide arriving moves the cards down; their own size holds.
    expectSameBoxes(statusCards, loadingCards, await boxes(page, statusCards), ["width", "height"]);
  }
});

test("On a wide screen the usage banner and its placeholder stay in the content column", async ({
  page,
}) => {
  // Wider than the column's 1420px limit, where a misplaced banner spreads out.
  await page.setViewportSize({ width: 2000, height: 1000 });
  await holdOverviewData(page);
  await page.goto("/dashboard/connect/overview");
  await release(page);
  await expectLoaded(page);
  await expectInColumn(page, ".usageConversion");
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage).some((key) => key.startsWith("remotearc.overview.layout:")),
      ),
    )
    .toBe(true);
  await page.reload();
  await expectLoading(page);
  await expectInColumn(page, ".overviewSkeletonBlock");
  await release(page);
  await expectLoaded(page);
});
