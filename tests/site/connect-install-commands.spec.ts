import { test, expect } from "./fixtures";

test("Connect homepage offers the install command in the hero and every method at the close", async ({
  page,
}, info) => {
  const zh = info.project.metadata.language === "zh";
  await page.goto(zh ? "/zh" : "/");
  // The hero offers the no-Node.js installer first and switches to npx.
  const heroCommand = page.locator(".homeHero .heroCommand");
  await expect(heroCommand.locator("code")).toHaveText(
    "$ curl -fsSL https://remotearc.app/install.sh | sh",
  );
  await heroCommand.getByRole("tab", { name: "npx" }).click();
  await expect(heroCommand.getByRole("tab", { name: "npx" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(heroCommand.locator("code")).toHaveText("$ npx remotelink@latest");
  const commands = page.locator(".homeClosing .installCommands");
  await commands.scrollIntoViewIfNeeded();
  await expect(commands).toBeVisible();
  // The closing card also starts on the installer that needs no Node.js.
  await expect(commands.locator("code")).toHaveText(
    "curl -fsSL https://remotearc.app/install.sh | sh",
  );
  await expect(commands).toContainText(
    zh ? "首次安装后会直接启动 Agent" : "On a first install the Agent starts right away",
  );
  await expect(commands).toContainText(zh ? "无需 Node.js" : "No Node.js");
  const curl = commands.getByRole("tab", { name: /curl/ });
  await curl.focus();
  await page.keyboard.press("ArrowRight");
  await expect(commands.getByRole("tab", { name: /npx/ })).toBeFocused();
  await expect(commands.locator("code")).toHaveText("npx remotelink@latest");
  await commands.locator("code").click();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(2);
  await page.screenshot({
    path: `work/home-install-commands-${info.project.name}.png`,
    fullPage: false,
  });
  const download = commands.getByRole("link", { name: zh ? "直接下载" : "Download", exact: true });
  await expect(download).toHaveAttribute("href", zh ? "/zh/downloads" : "/downloads");
  await download.click();
  await expect(page.locator(".nativeDownloadCard")).toHaveCount(3);
  await expect(page.locator('.nativeInstall a[href^="/api/downloads/agent/"]')).toHaveCount(6);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(2);
  await page.screenshot({ path: `work/native-downloads-${info.project.name}.png`, fullPage: true });
});
