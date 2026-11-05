import { test, expect } from "./fixtures";

test("Admin health exposes device timeouts even without Worker 5xx", async ({ page }, info) => {
  const zh = info.project.metadata.language === "zh";
  await page.goto("/admin-preview?section=health");
  await page
    .locator(".healthSection")
    .filter({ has: page.locator(".deviceExecutionHealth") })
    .locator(">summary")
    .click();
  const panel = page.getByRole("region", {
    name: zh ? "设备执行健康" : "Device execution health",
    exact: true,
  });
  await expect(panel.getByText("Example Mac", { exact: true })).toBeVisible();
  await expect(panel).toContainText(zh ? "3 次超时" : "3 timeouts");
  await expect(panel).toContainText(zh ? "以下不代表真实设备故障" : "not a real device incident");
  await expect(panel).toContainText(zh ? "执行结果待确认" : "operation result unknown");
  await expect(panel).toContainText(zh ? "任务防休眠保障失败" : "task keep-awake failures");
  await expect(page.locator(".healthStatusStrip")).toContainText(
    zh ? "发现异常" : "Issues observed",
  );
  await expect(page.locator(".healthStatusStrip")).toContainText("0 / 0 / 2");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    (page.viewportSize()?.width || 0) + 1,
  );
});

test("Expired device signal is not advertised as Online", async ({ page }, info) => {
  const zh = info.project.metadata.language === "zh";
  await page.goto("/dashboard/connect/devices?device-signal=stale");
  const card = page.locator(".deviceCard").filter({ hasText: "Personal Mac" });
  await expect(card.getByText(zh ? "信号已过期" : "Signal expired", { exact: true })).toBeVisible();
  await expect(card.locator(".badge.online")).toHaveCount(0);
  await expect(card).toContainText(
    zh ? "此前超时的操作仍可能已经执行" : "a timed-out operation may still have executed",
  );
  await expect(card).toContainText("v0.6.5");
  await card
    .getByRole("button", { name: zh ? "检查并恢复" : "Check & reconnect", exact: true })
    .click();
  await expect(card.getByRole("status")).toContainText(zh ? "请先唤醒电脑" : "Wake this computer");
  await expect(card.locator(".badge.online")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    (page.viewportSize()?.width || 0) + 1,
  );
});

test("Fresh signal with an unanswered call stays unconfirmed after a connection check", async ({
  page,
}, info) => {
  const zh = info.project.metadata.language === "zh";
  await page.goto("/dashboard/connect/devices?device-signal=unresponsive");
  const card = page.locator(".deviceCard").filter({ hasText: "Personal Mac" });
  await expect(
    card.getByText(zh ? "响应待确认" : "Response unconfirmed", { exact: true }),
  ).toBeVisible();
  await card
    .getByRole("button", { name: zh ? "检查并恢复" : "Check & reconnect", exact: true })
    .click();
  await expect(card.getByRole("status")).toContainText(
    zh ? "不代表执行已恢复" : "does not confirm execution",
  );
  await expect(card.locator(".badge.online")).toHaveCount(0);
});
