import { test, expect } from "./fixtures";

test("notification settings explain Slack linking, set up a signed webhook once and choose its events", async ({
  page,
}) => {
  await page.goto("/settings?section=notifications");
  await expect(page.locator("[data-channel=email]")).toHaveCount(0);

  const slack = page.locator("[data-channel=slack]");
  await expect(slack).toContainText(/Link your Slack account first|请先关联 Slack 账号/);
  await expect(slack.getByRole("button", { name: /^(Off|已关闭)$/ })).toBeDisabled();

  const webhook = page.locator("[data-channel=webhook]");
  const turnOn = webhook.getByRole("button", { name: /^(Off|已关闭)$/ });
  await expect(turnOn).toBeDisabled();
  await webhook.getByLabel(/Webhook URL/).fill("http://hooks.example.com/arc");
  await webhook.getByRole("button", { name: /^(Save URL|保存 URL)$/ }).click();
  await expect(webhook.getByRole("alert")).toContainText(/public HTTPS/);
  await webhook.getByLabel(/Webhook URL/).fill("https://hooks.example.com/arc");
  await turnOn.click();
  const secret = webhook.getByRole("status");
  await expect(secret).toContainText(/whsec_/);
  await secret.getByRole("button", { name: /I saved it|我已保存/ }).click();
  await expect(webhook.getByRole("status")).toHaveCount(0);
  await expect(webhook.getByRole("button", { name: /^(On|已开启)$/ })).toBeVisible();

  const runFailed = webhook.getByRole("checkbox", {
    name: /Any routine run fails|任何一次运行失败/,
  });
  await expect(runFailed).toBeChecked();
  await runFailed.uncheck();
  await expect(runFailed).not.toBeChecked();
  await webhook.getByRole("button", { name: /Send a test|发送测试/ }).click();
  await expect(webhook).toContainText(/Test queued|测试已排队/);
});
