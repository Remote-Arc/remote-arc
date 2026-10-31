import {test,expect} from "./fixtures";

for (const path of ["/dashboard/connect/devices", "/devices", "/dashboard/agent/devices"]) {
 test("Device tools keep manual authentication guidance: " + path, async ({page}) => {
  await page.goto(path + "?demo=browser-auth");
  await page.getByRole("button",{name:/Manage Personal Mac|管理 Personal Mac/}).click();
  const details=page.locator(".deviceToolDetails").first();
  await details.locator("summary").click();
  await expect(details.locator(".browserAuthSetting")).toHaveCount(0);
  await expect(details.getByRole("button",{name:/Approve and save|批准并保存/})).toHaveCount(0);
  await expect(details.locator('label').filter({has:page.locator('strong', {hasText:/^browser_runner$/})}).getByRole("checkbox")).toBeChecked();
  await expect(details.locator('label').filter({has:page.locator('strong', {hasText:/^read_file$/})}).getByRole("checkbox")).toBeChecked();
  const runnerSettings=details.getByRole("button",{name:/Browser Runner settings|Browser Runner 设置/});
  await expect(runnerSettings).toHaveAttribute("aria-expanded","false");
  await expect(details.getByRole("combobox")).toHaveCount(0);
  await expect(details.locator(".browserAuthenticationNotice")).toHaveCount(0);
  await runnerSettings.click();
  await expect(runnerSettings).toHaveAttribute("aria-expanded","true");
  await expect(details.getByRole("combobox")).toHaveValue("show_and_notify");
  await expect(details.locator(".browserAuthenticationNotice")).toContainText(/Your AI can continue|完成后 AI 可以继续/);
  await details.getByRole("combobox").selectOption("notify_only");
  await expect(details.getByRole("combobox")).toBeEnabled();
  await runnerSettings.click();
  await expect(details.getByRole("combobox")).toHaveCount(0);
  await runnerSettings.click();
  await expect(details.getByRole("combobox")).toHaveValue("notify_only");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
}

for (const workspace of ["connect", "agent"]) {
 test("Settings do not expose retired authentication controls: " + workspace, async ({page}) => {
  await page.goto("/dashboard/" + workspace + "/settings?section=browser-auth&demo=browser-auth");
  await expect(page.getByRole("heading",{name:/^Your profile$|^个人资料$/})).toBeVisible();
  await expect(page.locator(".browserAuthSetting")).toHaveCount(0);
  await expect(page.getByRole("button",{name:/^Browser authentication$|^浏览器认证$/})).toHaveCount(0);
 });
}
