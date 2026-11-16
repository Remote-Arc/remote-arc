import { test, expect } from "./fixtures";

// The one-off Connect trial never starts by itself: the Overview offers a button once
// Free calls run out, and explains when no trial is available.
test("the Overview starts the Connect trial only when the person clicks", async ({
  page,
}, info) => {
  const zh = info.project.metadata.language === "zh";
  await page.goto("/dashboard/connect/overview?quota=full");
  const banner = page.locator(".usageConversion");
  await expect(banner).toContainText(zh ? "试用不会自动开始" : "never starts by itself");
  const start = banner.getByRole("button", {
    name: zh ? "开始 7 天试用" : "Start the 7-day trial",
  });
  await expect(start).toBeVisible();
  await start.click();
  await expect(banner.getByRole("heading", { level: 2 })).toHaveText(
    zh ? "已为你开启 7 天无限调用试用" : "Your agents are on a 7-day unlimited Connect trial",
  );
  await expect(start).toHaveCount(0);
});

test("the Overview says why there is no trial on a shared computer", async ({ page }, info) => {
  const zh = info.project.metadata.language === "zh";
  await page.goto("/dashboard/connect/overview?quota=shared");
  const banner = page.locator(".usageConversion");
  await expect(banner).toContainText(
    zh ? "这台电脑上的另一个账号已经用过" : "another account on this computer has already used it",
  );
  await expect(banner.getByRole("button", { name: /7/ })).toHaveCount(0);
});

test("a used-up write cap offers the trial instead of starting it", async ({ page }, info) => {
  const zh = info.project.metadata.language === "zh";
  await page.goto("/dashboard/connect/overview?quota=writes-next");
  const banner = page.locator(".usageConversion");
  await expect(
    banner.getByRole("button", { name: zh ? "开始 7 天试用" : "Start the 7-day trial" }),
  ).toBeVisible();
  await expect(banner).toContainText(zh ? "读取类工具照常可用" : "read tools keep working");
});
