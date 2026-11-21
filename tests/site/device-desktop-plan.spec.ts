import { test, expect } from "./fixtures";

// Computer use is a Pro and Max feature: on Free the desktop control switch says
// so and offers the Pro trial, and on Pro it can be turned on.
for (const plan of ["free", "pro"] as const)
  test(`Desktop control on ${plan === "free" ? "Free asks for Pro" : "Pro can be turned on"}`, async ({
    page,
  }, info) => {
    const zh = info.project.metadata.language === "zh";
    await page.goto("/dashboard/connect/devices" + (plan === "free" ? "?plan=free" : ""));
    const card = page.locator(".deviceCard").filter({ hasText: "Desktop PC" });
    await card
      .getByRole("button", { name: zh ? "管理 Desktop PC" : "Manage Desktop PC", exact: true })
      .click();
    await card
      .getByRole("tab", { name: zh ? "权限与文件" : "Access & files", exact: true })
      .click();
    // The individual switches sit in a folded section under the presets.
    await card.getByText(zh ? "逐项管理技能" : "Manage individual skills", { exact: true }).click();
    const toggle = card
      .locator("label.toolToggle")
      .filter({ hasText: zh ? "桌面控制" : "Desktop control" });
    const box = toggle.getByRole("checkbox");
    await expect(box).not.toBeChecked();
    if (plan === "free") {
      await expect(toggle.locator(".desktopPlanBadge")).toHaveText("Pro");
      await expect(box).toBeDisabled();
      const note = card.locator(".desktopPlanNote");
      await expect(note).toContainText(zh ? "Pro 和 Max" : "Pro and Max");
      await expect(
        note.getByRole("link", { name: zh ? "开始 Pro 试用" : "Start the Pro trial" }),
      ).toHaveAttribute("href", /\/checkout\?product=pro&trial=1$/);
    } else {
      await expect(toggle.locator(".desktopPlanBadge")).toHaveCount(0);
      await expect(card.locator(".desktopPlanNote")).toHaveCount(0);
      await expect(box).toBeEnabled();
    }
  });
