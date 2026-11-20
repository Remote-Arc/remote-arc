import { test, expect } from "./fixtures";

// The local preview answers /api/* inside the page, so page.route cannot delay
// it. This wraps the fetch the page installs and holds the account's billing
// request (not the public catalog) until the test releases it.
test("Plan & usage shows the Free limits while the account's billing loads", async ({ page }) => {
  await page.addInitScript(() => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    Object.assign(window, { __releaseBilling: () => release() });
    let current = window.fetch;
    Object.defineProperty(window, "fetch", {
      configurable: true,
      get: () => current,
      set: (next: typeof fetch) => {
        current = async (input, init) => {
          const raw = input instanceof Request ? input.url : String(input);
          if (new URL(raw, location.origin).pathname === "/api/billing") await gate;
          return next(input, init);
        };
      },
    });
  });
  await page.goto("/settings?section=billing");
  const summary = page.locator(".raBillingSummary");
  await expect(summary).toContainText("Connect Free");
  await expect(summary).toContainText(/10,000 Connect calls a month|每月 10,000 次 Connect 调用/);
  await expect(summary).toContainText(/up to 2 computers|最多 2 台电脑/);
  await expect(
    page.getByRole("status").filter({ hasText: /Loading billing|正在获取账单/ }),
  ).toBeVisible();

  await page.evaluate(() =>
    (window as unknown as { __releaseBilling: () => void }).__releaseBilling(),
  );
  // The account's own plan replaces the preview once it arrives.
  await expect(
    page.getByRole("status").filter({ hasText: /Loading billing|正在获取账单/ }),
  ).toHaveCount(0);
  await expect(summary).toHaveCount(1);
  await expect(summary).not.toContainText(/FREE PLAN INCLUDES|Free 套餐包含/);
});
