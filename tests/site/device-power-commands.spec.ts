import { test, expect } from "./fixtures";

// Shutdown and restart are off by default, turning them on asks for confirmation,
// and a computer whose Agent cannot honour the setting cannot turn it on.
test("Shutdown and restart need the owner's confirmation and a supporting Agent", async ({
  page,
}, info) => {
  const zh = info.project.metadata.language === "zh";
  await page.goto("/dashboard/connect/devices");

  const openSafety = async (name: string) => {
    const card = page.locator(".deviceCard").filter({ hasText: name });
    await card
      .getByRole("button", { name: zh ? "管理 " + name : "Manage " + name, exact: true })
      .click();
    await card
      .getByRole("tab", { name: zh ? "权限与文件" : "Access & files", exact: true })
      .click();
    await card
      .locator(".deviceSafetyDetails summary")
      .filter({ hasText: zh ? "文件边界与恢复" : "File boundaries & recovery" })
      .click();
    return card.locator(".powerCommandsSetting");
  };
  const label = zh ? "允许关机和重启" : "Allow shutdown and restart";

  const mac = await openSafety("Personal Mac");
  const macSwitch = mac.getByRole("checkbox", { name: label, exact: true });
  await expect(macSwitch).not.toBeChecked();
  await expect(macSwitch).toBeEnabled();
  await expect(mac).toContainText(
    zh
      ? "AI 发出的关机、重启命令会被这台电脑拒绝"
      : "Shutdown and restart commands from AI are refused",
  );

  // Cancelling the confirmation leaves it off.
  await macSwitch.click({ force: true });
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(
    zh ? "允许 Personal Mac 关机和重启？" : "Allow shutdown and restart on Personal Mac?",
  );
  await expect(dialog).toContainText(zh ? "擦除磁盘" : "Disk erasure");
  await dialog.getByRole("button", { name: zh ? "取消" : "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(macSwitch).not.toBeChecked();

  // Confirming turns it on and says what still applies.
  await macSwitch.click({ force: true });
  await page.getByRole("dialog").getByRole("button", { name: label, exact: true }).click();
  await expect(macSwitch).toBeChecked();
  await expect(mac.locator(".powerCommandsNote.is-warning")).toContainText(
    zh ? "其他安全守卫规则仍然有效" : "the other Safety Guard rules still apply",
  );
  await mac.scrollIntoViewIfNeeded();
  await mac.screenshot({ path: info.outputPath("power-commands-on.png") });

  // Turning it off needs no confirmation.
  await macSwitch.click({ force: true });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(macSwitch).not.toBeChecked();

  // An Agent without power_commands_v1 cannot turn it on.
  const pc = await openSafety("Desktop PC");
  const pcSwitch = pc.getByRole("checkbox", { name: label, exact: true });
  await expect(pcSwitch).toBeDisabled();
  await expect(pcSwitch).not.toBeChecked();
  await expect(pc).toContainText(
    zh ? "请先更新这台电脑上的 Agent" : "Update the Agent on this computer",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    (page.viewportSize()?.width || 0) + 1,
  );
});
