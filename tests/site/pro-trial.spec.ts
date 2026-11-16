import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

// The card-backed Pro trial at checkout: nothing due today, the first charge date,
// cancelling only in billing settings, and paying now instead.
async function account(page: Page, state: Record<string, unknown> = {}) {
  await page.addInitScript((extra) => {
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
        trialOffered: true,
        ...extra,
      }),
    );
  }, state);
}

test("a Free account starts the Pro trial at checkout with nothing due today", async ({
  page,
}, info) => {
  const zh = info.project.metadata.language === "zh";
  await account(page);
  await page.goto("/checkout?product=pro&trial=1");
  const summary = page.locator(".arcCheckoutSummary");
  await expect(summary.locator(".proTrialChoice")).toContainText(
    zh ? "Pro 免费试用 7 天" : "7-day free trial of Pro",
  );
  await expect(summary).toContainText(zh ? "今天不扣费" : "Nothing is charged today");
  await expect(summary).toContainText(zh ? "取消续费" : "Cancel renewal");
  await summary
    .getByRole("button", { name: zh ? "继续开启免费试用" : "Continue to free trial" })
    .click();
  const submit = page.locator(".arcElementsSubmit");
  // The preview's own button simulates payment; the live form says "Start 7-day free trial".
  await expect(page.locator(".arcElementsTotal dd")).toContainText("$0.00");
  await expect(page.locator(".arcElementsSummary")).toContainText(
    zh ? "前免费，之后按" : "Free until",
  );
  await page.screenshot({ path: info.outputPath("pro-trial-payment.png"), fullPage: true });
  await submit.click();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(
    zh ? "Pro 试用已开始" : "Your Pro trial has started",
  );
  await page.goto("/settings?section=billing");
  await expect(page.locator(".raBillingSummary")).toContainText(
    zh ? "除非取消续费" : "unless you cancel renewal",
  );
});

test("the person can pay now instead of starting the trial", async ({ page }, info) => {
  const zh = info.project.metadata.language === "zh";
  await account(page);
  await page.goto("/checkout?product=pro");
  const summary = page.locator(".arcCheckoutSummary");
  await summary
    .getByRole("button", { name: zh ? "不试用，直接付款" : "Pay now instead, without the trial" })
    .click();
  await expect(summary.locator(".proTrialChoice")).toHaveCount(0);
  await expect(
    summary.getByRole("button", { name: zh ? "继续付款" : "Continue to payment", exact: true }),
  ).toBeVisible();
  await summary
    .getByRole("button", {
      name: zh ? "改为先免费试用 7 天" : "Start with a 7-day free trial instead",
    })
    .click();
  await expect(summary.locator(".proTrialChoice")).toBeVisible();
});

test("a trial link says why an account that had its trial cannot start another", async ({
  page,
}, info) => {
  const zh = info.project.metadata.language === "zh";
  await account(page, { trialEndsAt: new Date(Date.now() - 86400000).toISOString() });
  await page.goto("/checkout?product=pro&trial=1");
  const summary = page.locator(".arcCheckoutSummary");
  await expect(summary).toContainText(zh ? "该账号已使用过 Pro 试用" : "already had its Pro trial");
  await expect(
    summary.getByRole("button", { name: zh ? "继续付款" : "Continue to payment", exact: true }),
  ).toBeVisible();
});

test("once the Pro trial is on, the pricing page asks for a payment method and links to it", async ({
  page,
}, info) => {
  const zh = info.project.metadata.language === "zh";
  await page.goto((zh ? "/zh" : "") + "/pricing?trial=pro");
  const trial = page.locator(".arcPricingTrial");
  await expect(trial).toContainText(zh ? "开始时需保存付款方式" : "Save a payment method to start");
  await expect(trial).not.toContainText(zh ? "无需信用卡" : "No card required");
  await expect(trial.getByRole("link")).toHaveAttribute(
    "href",
    "https://agent.remotearc.app/checkout?product=pro&trial=1",
  );
});

test("the Overview offers the trial at any time, and in place of the slow lane", async ({
  page,
}, info) => {
  const zh = info.project.metadata.language === "zh";
  await page.goto("/dashboard/connect/overview?quota=low");
  const entry = page.locator(".proTrialEntry");
  await expect(entry).toContainText(
    zh ? "免费试用 Pro 或 Max 7 天" : "Try Pro or Max free for 7 days",
  );
  await expect(entry.getByRole("link")).toHaveAttribute("href", "/checkout?product=pro&trial=1");
  await expect(page.locator(".usageConversion")).toHaveCount(0);

  await page.goto("/dashboard/connect/overview?quota=full");
  const banner = page.locator(".usageConversion");
  await expect(
    banner.getByRole("link", { name: zh ? /免费试用 Pro 7 天/ : /Try Pro free for 7 days/ }),
  ).toHaveAttribute("href", "/checkout?product=pro&trial=1");
  await expect(banner).toContainText(
    zh ? "只有试用结束后继续使用 Pro 才会扣费" : "charged only if you keep Pro",
  );
  await expect(
    banner.getByRole("button", { name: zh ? "开始 7 天试用" : "Start the 7-day trial" }),
  ).toHaveCount(0);
  await expect(page.locator(".proTrialEntry")).toHaveCount(0);

  await page.goto("/dashboard/connect/overview?quota=low&protrial=used");
  await expect(page.locator(".proTrialEntry")).toHaveCount(0);
});

test("a Free account can start a Max trial billed yearly", async ({ page }, info) => {
  const zh = info.project.metadata.language === "zh";
  await account(page);
  await page.goto("/checkout?product=arc-pro-v1&interval=year&trial=1");
  const summary = page.locator(".arcCheckoutSummary");
  await expect(summary.locator(".proTrialChoice")).toContainText(
    zh ? "Max 免费试用 7 天" : "7-day free trial of Max",
  );
  await expect(summary.locator(".proTrialChoice")).toContainText(zh ? "/年" : "/year");
});

test("a paying Pro account sees today's charge and agrees before upgrading to Max", async ({
  page,
}, info) => {
  const zh = info.project.metadata.language === "zh";
  await account(page, { planId: "connect-unlimited-v1" });
  await page.goto("/checkout?product=arc-pro-v1");
  const summary = page.locator(".arcCheckoutSummary");
  const change = summary.locator(".planChange");
  await expect(change).toContainText(zh ? "当前套餐未用时间抵扣" : "Credit for unused time");
  await expect(change).toContainText(zh ? "今天应付" : "Due today");
  const upgrade = change.getByRole("button", { name: zh ? "立即升级" : "Upgrade now" });
  await expect(upgrade).toBeDisabled();
  await change.getByRole("checkbox").check();
  await page.screenshot({ path: info.outputPath("upgrade-summary.png"), fullPage: true });
  await upgrade.click();
  await expect(change).toContainText(zh ? "Max 已生效" : "Max is active now");
});

test("during a trial the plan switches at once and nothing is charged", async ({ page }, info) => {
  const zh = info.project.metadata.language === "zh";
  await account(page, {
    planId: "connect-unlimited-v1",
    trialEndsAt: new Date(Date.now() + 5 * 86400000).toISOString(),
  });
  await page.goto("/checkout?product=arc-pro-v1");
  const change = page.locator(".arcCheckoutSummary .planChange");
  await expect(change).toContainText(zh ? "不扣费" : "nothing is charged");
  await change.getByRole("button", { name: zh ? "切换套餐" : "Switch plan" }).click();
  await expect(change).toContainText(zh ? "试用已切换到 Max" : "Your trial is now on Max");
});

test("in dark mode, primary actions are plain white with dark text", async ({ page }, info) => {
  await account(page);
  await page.goto("/checkout?product=pro&trial=1");
  const continueButton = page.locator(".arcCheckoutSummary .arcCheckoutContinue");
  await expect(continueButton).toBeVisible();
  const style = await continueButton.evaluate((el) => {
    const computed = getComputedStyle(el);
    return {
      image: computed.backgroundImage,
      color: computed.backgroundColor,
      ink: computed.color,
    };
  });
  expect(style.image).toBe("none");
  if (info.project.metadata.theme === "dark") {
    expect(style.color).toBe("rgb(255, 255, 255)");
    expect(style.ink).toBe("rgb(11, 18, 32)");
  }
});
