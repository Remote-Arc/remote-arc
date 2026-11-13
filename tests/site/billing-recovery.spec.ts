import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

const planLink = (scope: ReturnType<Page["locator"]>) =>
  scope.getByRole("link", { name: /View plan & usage|查看套餐与用量/ });
async function freeAccount(page: Page) {
  await page.addInitScript(() => {
    if (window !== window.top || sessionStorage.getItem("remote-arc-billing-preview-v1")) return;
    sessionStorage.setItem(
      "remote-arc-billing-preview-v1",
      JSON.stringify({
        planId: "free",
        revision: 0,
        cancelled: false,
        pending: null,
        methodUpdated: false,
        orders: {},
      }),
    );
  });
}
for (const code of ["APP_CONNECTION_LIMIT", "app_connection_limit"])
  test(
    "App connection limit " + code + " leads from recovery to plan choice and a payment form",
    async ({ page }, testInfo) => {
      await freeAccount(page);
      await page.goto("/dashboard/connect/apps?app_error=" + code);
      const alert = page.locator(".appsManagerError");
      await expect(alert).toContainText(/connected-account limit|应用账号连接上限/);
      await expect(
        alert.getByRole("link", { name: /Manage connected accounts|管理已连接账号/ }),
      ).toHaveAttribute("href", "/dashboard/connect/apps?view=connected");
      await expect(planLink(alert)).toHaveAttribute("href", "/settings?section=billing");
      await expect
        .poll(async () => (await alert.locator("p").first().boundingBox())?.width ?? 0)
        .toBeGreaterThan(220);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      await page.screenshot({ path: testInfo.outputPath("app-limit-guidance.png") });
      await planLink(alert).click();
      await page.getByRole("link", { name: /Choose a plan|选择套餐/, exact: true }).click();
      await expect(page).toHaveURL(/\/checkout/);
      await page
        .getByRole("group", { name: /Available offers|可用套餐/ })
        .getByRole("button", { name: /^Pro\b/ })
        .click();
      await page.getByRole("button", { name: /Continue to payment|继续付款/, exact: true }).click();
      await expect(
        page.getByRole("heading", { name: /Payment details|付款信息/, exact: true }),
      ).toBeVisible();
      await expect(page.locator(".arcElementsSubmit")).toBeEnabled();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      await page.screenshot({
        path: testInfo.outputPath("guided-payment-form.png"),
        fullPage: true,
      });
      // Stop before the preview payment button: reaching the form is the requested flow.
    },
  );

for (const code of [
  "MONTHLY_LIMIT_REACHED",
  "BILLING_CREDITS_EXHAUSTED",
  "BINARY_TRANSFER_LIMIT_REACHED",
])
  test("Arc surfaces an actionable " + code, async ({ page }) => {
    await page.goto("/dashboard/agent/chat");
    await page.evaluate((code) => {
      const original = window.fetch;
      (window as any).__blockedCalls = 0;
      window.fetch = async (input, init) => {
        const path = new URL(
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
          location.origin,
        ).pathname;
        if (path.endsWith("/messages") && init?.method === "POST") {
          (window as any).__blockedCalls++;
          return Response.json({ error: code }, { status: 402 });
        }
        return original(input, init);
      };
    }, code);
    const input = page.locator("#arc-chat-input");
    await input.fill("Keep this task draft.");
    await page.locator(".arcChatSend").click();
    const alert = page.locator(".arcChatError");
    await expect(planLink(alert)).toBeVisible();
    await expect(planLink(alert)).toHaveAttribute("href", "/settings?section=billing");
    await expect(input).toHaveValue("Keep this task draft.");
    expect(await page.evaluate(() => (window as any).__blockedCalls)).toBe(1);
  });

for (const code of ["BILLING_INVALID_PLAN_CHANGE", "BILLING_CHECKOUT_AWAITING_CONFIRMATION"])
  test("Checkout offers status recovery for " + code, async ({ page }, testInfo) => {
    await page.goto("/checkout?demo=new");
    await page.evaluate((code) => {
      const original = window.fetch;
      (window as any).__checkoutPosts = 0;
      window.fetch = async (input, init) => {
        const path = new URL(
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
          location.origin,
        ).pathname;
        if (path === "/api/billing/checkout" && init?.method === "POST") {
          (window as any).__checkoutPosts++;
          return Response.json({ error: code }, { status: 409 });
        }
        return original(input, init);
      };
    }, code);
    await page.getByRole("button", { name: /Continue to payment|继续付款/, exact: true }).click();
    const alert = page.locator(".arcCheckoutAlert");
    await expect(planLink(alert)).toBeVisible();
    await expect(alert).toContainText(
      code === "BILLING_INVALID_PLAN_CHANGE"
        ? /current subscription|当前订阅/
        : /Do not pay again|请勿再次付款/,
    );
    expect(await page.evaluate(() => (window as any).__checkoutPosts)).toBe(1);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.screenshot({ path: testInfo.outputPath(code + "-recovery.png"), fullPage: true });
  });

// ---- An unfinished subscription checkout when another offer is chosen.
const continueButton = (page: Page) =>
  page.getByRole("button", { name: /Continue to payment|继续付款/, exact: true });
const paymentHeading = (page: Page) =>
  page.getByRole("heading", { name: /Payment details|付款信息/, exact: true });
const period = (page: Page, name: RegExp) =>
  page.getByRole("radiogroup", { name: /Billing period|付费周期/ }).getByRole("radio", { name });
const previewOrders = (page: Page) =>
  page.evaluate(
    () =>
      Object.values(
        JSON.parse(sessionStorage.getItem("remote-arc-billing-preview-v1") || "{}").orders || {},
      ) as Array<{ interval?: string; status: string }>,
  );
async function choosePro(page: Page) {
  await page.goto("/checkout?demo=new");
  await page
    .getByRole("group", { name: /Available offers|可用套餐/ })
    .getByRole("button", { name: /^Pro\b/ })
    .click();
}
/** Opens a monthly checkout, leaves it unpaid, then asks for yearly instead. */
async function switchToYearlyWithUnpaidMonthly(page: Page) {
  await choosePro(page);
  await expect(period(page, /Monthly|按月/)).toHaveAttribute("aria-checked", "true");
  await continueButton(page).click();
  await expect(paymentHeading(page)).toBeVisible();
  // Leaving the page keeps the provider order open, as a closed tab would.
  // Reopen without ?demo=new, which would reset the preview orders.
  const reopened = new URL(page.url());
  reopened.searchParams.delete("demo");
  await page.goto(reopened.href);
  await period(page, /Yearly|按年/).click();
  await continueButton(page).click();
  const alert = page.locator(".arcCheckoutAlert");
  await expect(alert).toContainText(/unfinished checkout|尚未完成的结账/);
  await expect(alert.locator(".arcCheckoutPendingOrder strong")).toContainText(/Monthly|按月/);
  return alert;
}
const resumeButton = (scope: ReturnType<Page["locator"]>) =>
  scope.getByRole("button", { name: /Continue original checkout|继续原结账/ });
const closeButton = (scope: ReturnType<Page["locator"]>) =>
  scope.getByRole("button", {
    name: /Close old checkout and choose .*Yearly|关闭旧结账并选择 .*按年/,
  });

test("Switching period with an unpaid checkout resumes the original order", async ({
  page,
}, testInfo) => {
  const alert = await switchToYearlyWithUnpaidMonthly(page);
  await expect(closeButton(alert)).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.screenshot({ path: testInfo.outputPath("unfinished-checkout.png"), fullPage: true });
  await resumeButton(alert).click();
  await expect(paymentHeading(page)).toBeVisible();
  await expect(page).not.toHaveURL(/interval=year/);
  expect(await previewOrders(page)).toEqual([
    expect.objectContaining({ interval: "month", status: "open" }),
  ]);
});

test("Switching period with an unpaid checkout can close it and start the new choice", async ({
  page,
}) => {
  const alert = await switchToYearlyWithUnpaidMonthly(page);
  await closeButton(alert).click();
  await expect(paymentHeading(page)).toBeVisible();
  await expect(page).toHaveURL(/interval=year/);
  expect(await previewOrders(page)).toEqual([
    expect.objectContaining({ interval: "month", status: "expired" }),
    expect.objectContaining({ interval: "year", status: "open" }),
  ]);
});

test("A failed resume still lets the old checkout be closed", async ({ page }) => {
  const alert = await switchToYearlyWithUnpaidMonthly(page);
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const path = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        location.origin,
      ).pathname;
      if (path === "/api/billing/checkout" && String(init?.body).includes("resumeSessionId"))
        return Response.json({ error: "BILLING_INVALID_PRODUCT" }, { status: 400 });
      return original(input, init);
    };
  });
  await resumeButton(alert).click();
  await expect(resumeButton(alert)).toHaveCount(0);
  await closeButton(alert).click();
  await expect(paymentHeading(page)).toBeVisible();
  expect((await previewOrders(page)).map((order) => order.status)).toEqual(["expired", "open"]);
});

test("An order still being created explains the wait and returns to its offer", async ({
  page,
}) => {
  await choosePro(page);
  await period(page, /Yearly|按年/).click();
  await page.evaluate(() => {
    const original = window.fetch;
    let held = true;
    window.fetch = async (input, init) => {
      const path = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        location.origin,
      ).pathname;
      if (path === "/api/billing/checkout" && init?.method === "POST" && held) {
        held = false;
        return Response.json(
          {
            error: "BILLING_CHECKOUT_ALREADY_OPEN",
            recovery: {
              action: "wait",
              productId: "connect-unlimited-v1",
              interval: "month",
              expiresAt: new Date(Date.now() + 1800000).toISOString(),
              amountCents: 1900,
            },
          },
          { status: 409 },
        );
      }
      return original(input, init);
    };
  });
  await continueButton(page).click();
  const alert = page.locator(".arcCheckoutAlert");
  await expect(alert).toContainText(/still being set up|还在创建中/);
  await expect(alert.locator(".arcCheckoutPendingOrder small")).toBeVisible();
  await alert.getByRole("button", { name: /Go back to the original offer|回到原套餐/ }).click();
  await expect(alert).toHaveCount(0);
  await expect(period(page, /Monthly|按月/)).toHaveAttribute("aria-checked", "true");
  await continueButton(page).click();
  await expect(paymentHeading(page)).toBeVisible();
});
