import { test, expect } from "./fixtures";
import companionManifest from "../../apps/browser-extension/manifest.json" with { type: "json" };

test("Browser and Go updates share the device management update area", async ({ page }, info) => {
  const zh = info.project.metadata.language === "zh";
  await page.goto("/dashboard/connect/devices?demo=extension-update");
  const browser = page.locator(".deviceCard").filter({ hasText: "Chrome Browser" });
  await expect(browser.getByRole("heading", { name: "Chrome Browser", exact: true })).toBeVisible();
  await expect(
    browser.getByRole("button", { name: zh ? "有可用更新" : "Update available", exact: true }),
  ).toHaveCount(0);
  await expect(browser.locator(".badge.updateAvailable")).toHaveCount(0);
  await browser
    .getByRole("button", {
      name: zh ? "管理 Chrome Browser" : "Manage Chrome Browser",
      exact: true,
    })
    .click();
  await browser
    .getByRole("tab", { name: zh ? "后台与任务" : "Background & tasks", exact: true })
    .click();
  const panel = browser.getByRole("tabpanel", {
    name: zh ? "后台与任务" : "Background & tasks",
    exact: true,
  });
  const update = panel.locator(".deviceUpdateRow");
  await expect(
    update.getByText(zh ? "Remote Arc Browser 有可用更新" : "Remote Arc Browser update available", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(update).toContainText("v0.3.0");
  await expect(update).toContainText("v" + companionManifest.version);
  const download = update.getByRole("link", {
    name: zh ? "下载新版 ZIP" : "Download the new ZIP",
    exact: true,
  });
  await expect(download).toHaveAttribute("href", "/chrome-extension");
  await expect(download).toBeVisible();
  await download.click({ trial: true });
  await expect(update).toContainText(zh ? "同一个文件夹" : "same folder");
  await expect(update).toContainText("chrome://extensions");
  await expect(update).toContainText(zh ? "重新共享标签页" : "Share your tabs again");
  await expect(
    update.getByRole("button", { name: zh ? "复制升级命令" : "Copy upgrade command", exact: true }),
  ).toHaveCount(0);
  await update.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await update.screenshot({ path: info.outputPath("browser-update-panel.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    (page.viewportSize()?.width || 0) + 1,
  );
  await browser
    .getByRole("tab", { name: zh ? "权限与文件" : "Access & files", exact: true })
    .click();
  await expect(update).not.toBeVisible();

  const mac = page.locator(".deviceCard").filter({ hasText: "Personal Mac" });
  await mac
    .getByRole("button", { name: zh ? "管理 Personal Mac" : "Manage Personal Mac", exact: true })
    .click();
  await mac
    .getByRole("tab", { name: zh ? "后台与任务" : "Background & tasks", exact: true })
    .click();
  const agentUpdate = mac
    .getByRole("tabpanel", { name: zh ? "后台与任务" : "Background & tasks", exact: true })
    .locator(".agentUpdateCard");
  await expect(
    agentUpdate.getByText(zh ? "Remote Arc 有可用更新" : "Remote Arc update available", {
      exact: true,
    }),
  ).toBeVisible();
  // An Agent from before self-updating releases says this command is the last manual one.
  await expect(agentUpdate.locator(".agentUpdateNote")).toContainText("v0.7.1");
  await expect(agentUpdate.locator(".agentUpdateCommand code")).toContainText("npx -y remotelink@");
  await expect(
    agentUpdate.getByRole("button", { name: zh ? "复制" : "Copy", exact: true }),
  ).toBeVisible();
  await expect(
    agentUpdate.getByRole("button", { name: zh ? "立即更新" : "Update now", exact: true }),
  ).toHaveCount(0);
  await expect(
    agentUpdate.getByRole("link", {
      name: zh ? "下载新版 ZIP" : "Download the new ZIP",
      exact: true,
    }),
  ).toHaveCount(0);
});

test("A self-updating Agent offers a one-click update with its progress in the card", async ({
  page,
}, info) => {
  const zh = info.project.metadata.language === "zh";
  await page.goto("/dashboard/connect/devices?demo=agent-update");
  const server = page.locator(".deviceCard").filter({ hasText: "build-server-01" });
  await server
    .getByRole("button", {
      name: zh ? "管理 build-server-01" : "Manage build-server-01",
      exact: true,
    })
    .click();
  await server
    .getByRole("tab", { name: zh ? "后台与任务" : "Background & tasks", exact: true })
    .click();
  const card = server.locator(".agentUpdateCard");
  await expect(card.locator(".agentUpdateVersion.current")).toHaveText("v0.6.5");
  await expect(card.locator(".agentUpdateVersion.latest")).toContainText("v0.");
  await expect(card.locator(".agentUpdateNote")).toHaveCount(0);
  const command = card.locator(".agentUpdateManual");
  await expect(command.locator(".agentUpdateCommand")).not.toBeVisible();
  await command.locator("summary").click();
  await expect(command.locator(".agentUpdateCommand")).toBeVisible();
  await card.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await card.screenshot({ path: info.outputPath("agent-update-card.png") });
  await card.getByRole("button", { name: zh ? "立即更新" : "Update now", exact: true }).click();
  await expect(
    page.getByText(zh ? "更新这台电脑上的 Agent？" : "Update the Agent on this computer?", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .locator(".modal")
    .getByRole("button", { name: zh ? "立即更新" : "Update now", exact: true })
    .click();
  // The preview plays the stages; production follows the Relay and the reconnect.
  const steps = card.locator(".agentUpdateProgress li");
  await expect(steps).toHaveCount(3);
  await expect(card.locator('.agentUpdateProgress li[aria-current="step"]')).toHaveText(
    zh ? "下载并校验" : "Download and verify",
  );
  await expect(card.locator('.agentUpdateProgress li[aria-current="step"]')).toHaveText(
    zh ? "重启" : "Restart",
  );
  await expect(card.getByText(zh ? /^已更新到 v/ : /^Updated to v/)).toBeVisible();
  await card.screenshot({ path: info.outputPath("agent-update-done.png") });
  await card.getByRole("button", { name: zh ? "关闭" : "Dismiss", exact: true }).click();
  await expect(card.getByText(zh ? /^已更新到 v/ : /^Updated to v/)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    (page.viewportSize()?.width || 0) + 1,
  );
});
