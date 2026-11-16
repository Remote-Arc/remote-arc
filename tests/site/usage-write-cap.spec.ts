import { test, expect } from "./fixtures";

// A Free account whose calls that change something are used up, while reads remain:
// the Overview says edits and commands are paused, or that the next one starts the
// trial, and shows the write cap under the whole allowance.
for (const [quota, heading] of [
  ["writes", /File edits and commands are paused|改文件和执行命令已暂停/],
  ["writes-next", /calls that change things are used up|修改类调用用完了/],
] as const)
  test(
    "Overview explains a used-up write cap with reads left (" + quota + ")",
    async ({ page }) => {
      // The one-off Connect trial, as it works while the card-backed trial is off.
      await page.goto("/dashboard/connect/overview?protrial=off&quota=" + quota);
      const banner = page.locator(".usageConversion");
      await expect(banner.getByRole("heading", { level: 2 })).toHaveText(heading);
      await expect(banner.locator(".usageConversionWrites")).toContainText(/5,000 \/ 5,000/);
      if (quota === "writes") {
        await expect(banner).toContainText(/3,800/);
        await expect(banner).not.toContainText(/slow lane|慢速通道/);
      } else await expect(banner).toContainText(/trial|试用/);
    },
  );
