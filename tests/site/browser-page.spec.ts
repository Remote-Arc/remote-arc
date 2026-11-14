import { expect, test } from "@playwright/test";

test("The Browser page opens on its title and Chrome Web Store install, with the modes short and the full comparison folded", async ({
  page,
}, info) => {
  const zh = info.project.metadata.language === "zh";
  await page.goto((zh ? "/zh" : "") + "/chrome-extension");

  // The page leads with what it is and how to get it, not with the mode comparison.
  const title = page.getByRole("heading", { level: 1 });
  await expect(title).toHaveText(zh ? "让 AI 在 Chrome 里办事" : "Let your AI work in your Chrome");
  await expect(title).toBeInViewport();
  const install = page.locator(".chromeDownloadHero").getByRole("link", {
    name: zh ? /从 Chrome 应用商店安装/ : /Install from Chrome Web Store/,
  });
  await expect(install).toHaveAttribute(
    "href",
    "https://chromewebstore.google.com/detail/remote-arc-browser/eldbdnmgaecbdgpinljemenkolfmmjie",
  );
  await expect(install).toHaveAttribute("target", "_blank");
  await expect(install).toBeInViewport();
  // The page no longer sends anyone to the unpacked ZIP or Developer mode.
  await expect(page.locator('a[href*="remote-arc-browser.zip"]')).toHaveCount(0);
  await expect(page.locator(".chromeStepsGrid")).not.toContainText(
    zh ? "开发者模式" : "Developer mode",
  );
  await page.getByRole("link", { name: zh ? "安装步骤 ↓" : "How to install ↓" }).click();
  await expect(page.locator("#chrome-steps-title")).toBeInViewport();

  // Each mode is a short card: three highlights, no long lists until asked.
  const modes = page.locator(".browserModesCompact > .browserModesGrid > article");
  await expect(modes).toHaveCount(3);
  for (const mode of await modes.all()) {
    await expect(mode.locator(".browserModeHighlights li")).toHaveCount(3);
    await expect(mode.locator(".browserModeLimits")).toHaveCount(0);
  }

  // The full limits stay on the page, folded until the reader opens them.
  const compare = page.locator(".browserModesCompare");
  const limits = compare.locator(".browserModeLimits").first();
  await expect(limits).toBeHidden();
  await expect(limits).toContainText(zh ? "验证码" : "verification codes");
  await compare.locator("summary").click();
  await expect(limits).toBeVisible();
  await expect(compare.locator(".browserModeLimits")).toHaveCount(3);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
