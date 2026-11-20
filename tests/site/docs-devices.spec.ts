import { test, expect } from "./fixtures";

test("Devices docs start with how to pair a computer and what each preset enables", async ({
  page,
}, info) => {
  const zh = info.project.metadata.language === "zh";
  await page.goto((zh ? "/zh" : "") + "/docs/devices");
  const guide = page.locator("#pair-a-computer");
  await expect(guide.getByRole("heading", { name: /Pair a computer|配对一台电脑/ })).toBeVisible();
  // Install, approve, choose a preset, in that order, before the policy table.
  await expect(guide.locator(".devicePairingSteps > li")).toHaveCount(3);
  await expect(guide.locator("pre code")).toHaveText([
    "curl -fsSL https://remotearc.app/install.sh | sh",
    "npx remotelink@latest",
  ]);
  await expect(
    guide.getByRole("link", { name: /download the installer|下载安装程序/ }),
  ).toHaveAttribute("href", /\/downloads#native-downloads$/);

  const presets = guide.getByRole("list", { name: /Access presets|权限预设/ });
  await expect(presets.getByRole("listitem").locator("> strong")).toHaveText([
    "Safe",
    "Developer",
    "Full",
  ]);
  const preset = (name: string) =>
    presets.getByRole("listitem").filter({ has: page.locator("strong", { hasText: name }) });
  await expect(preset("Safe")).toContainText("read_file");
  await expect(preset("Safe")).not.toContainText("write_file");
  await expect(preset("Developer")).toContainText("write_file");
  await expect(preset("Developer")).not.toContainText("start_process");
  await expect(preset("Full")).toContainText("start_process");

  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
});
