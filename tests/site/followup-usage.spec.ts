import { test, expect } from "./fixtures";

const rows = (page: import("@playwright/test").Page) =>
  page.locator(".followupCrmFull .followupCrmTable tbody tr");
const filter = (page: import("@playwright/test").Page) =>
  page.getByRole("combobox", { name: /^Monthly usage$|^本月用量$/ });
async function open(page: import("@playwright/test").Page) {
  await page.goto("/admin-preview?section=followups");
  await expect(rows(page)).toHaveCount(6);
}
async function bulk(page: import("@playwright/test").Page, name: string) {
  await page.getByRole("checkbox", { name: new RegExp("^(Select |选择 )" + name + "$") }).check();
  await page.getByRole("button", { name: /^(Bulk email|群发邮件)/ }).click();
  return page.getByRole("dialog");
}

test("Monthly cohorts update counts and selection, excluding unlimited users from allowance warnings", async ({
  page,
}, testInfo) => {
  await open(page);
  for (const [usage, count] of [
    ["none", 2],
    ["used", 4],
    ["high", 3],
    ["near", 2],
    ["exhausted", 1],
  ] as const) {
    await filter(page).selectOption(usage);
    await expect(rows(page)).toHaveCount(count);
    await expect(page.getByRole("tab", { name: /^(All users|全部用户)/ })).toContainText(
      String(count),
    );
  }
  await expect(rows(page)).toContainText("Riley");
  await expect(rows(page)).toContainText("10,000 / 10,000");
  await page.getByRole("checkbox", { name: /^(Select |选择 )Riley$/ }).check();
  await filter(page).selectOption("near");
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByRole("checkbox", { name: /^(Select |选择 )Riley$/ })).not.toBeChecked();
  await expect(page.getByRole("button", { name: /Jordan Park/ })).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.screenshot({ path: testInfo.outputPath("monthly-usage-filter.png"), fullPage: true });
});

test("Exhausted allowance suggests an English upgrade email with a direct billing CTA", async ({
  page,
}, testInfo) => {
  await open(page);
  await filter(page).selectOption("exhausted");
  await expect(rows(page)).toHaveCount(1);
  const dialog = await bulk(page, "Riley");
  await expect(dialog.getByRole("combobox", { name: /Email language|邮件语言/ })).toHaveValue("en");
  await expect(dialog.getByRole("combobox", { name: /Bulk template|群发模板/ })).toHaveValue(
    "quota-upgrade",
  );
  await expect(dialog.getByRole("textbox", { name: /Bulk subject|群发主题/ })).toHaveValue(
    "Need more Remote Arc calls this month?",
  );
  // The billing link is the email's button, so the message points to it instead of pasting it.
  await expect(dialog.getByRole("textbox", { name: /Bulk message|群发正文/ })).toContainText(
    "review upgrade options with the link below",
  );
  await dialog.getByRole("button", { name: /Review recipients & emails|检查用户与邮件/ }).click();
  const preview = dialog.locator("iframe").contentFrame();
  await expect(preview.locator("html")).toHaveAttribute("lang", "en");
  await expect(preview.getByRole("link", { name: "Review upgrade options" })).toHaveAttribute(
    "href",
    "https://agent.remotearc.app/settings?section=billing",
  );
  await expect(preview.getByText("Hi Riley,", { exact: true })).toBeVisible();
  await expect(preview.locator("body")).not.toContainText("{{upgradeUrl}}");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.screenshot({ path: testInfo.outputPath("upgrade-email-preview.png"), fullPage: true });
  // Leave the isolated batch in review; never queue mail or call a provider.
});

test("High-usage follow-up asks about real use cases in English and allows Chinese explicitly", async ({
  page,
}) => {
  await open(page);
  await filter(page).selectOption("high");
  await expect(rows(page)).toHaveCount(3);
  const dialog = await bulk(page, "Morgan Lee");
  await expect(dialog.getByRole("combobox", { name: /Bulk template|群发模板/ })).toHaveValue(
    "use-case",
  );
  await expect(dialog.getByRole("textbox", { name: /Bulk subject|群发主题/ })).toHaveValue(
    "What do you usually use Remote Arc for?",
  );
  const language = dialog.getByRole("combobox", { name: /Email language|邮件语言/ });
  await expect(language).toHaveValue("en");
  await language.selectOption("zh");
  await expect(language).toHaveValue("zh");
  await language.selectOption("en");
  await dialog.getByRole("button", { name: /Review recipients & emails|检查用户与邮件/ }).click();
  const preview = dialog.locator("iframe").contentFrame();
  await expect(preview.getByRole("link", { name: "Share your use case" })).toHaveAttribute(
    "href",
    /^https:\/\/remotearc\.app\/feedback\?source=/,
  );
  await expect(preview.locator("body")).toContainText("reply");
});

test("New single drafts use English in both Admin languages and saved Chinese drafts retain their language", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: /Alex Chen/ }).click();
  const language = page.getByRole("combobox", { name: /^Email language$|^邮件语言$/ });
  await expect(language).toHaveValue("en");
  const subject = page.getByRole("textbox", { name: /^Subject$|^主题$/ });
  await expect(subject).toHaveValue(/^[A-Z]/);
  await language.selectOption("zh");
  const replacement = page.getByRole("dialog");
  if (await replacement.isVisible())
    await replacement.getByRole("button", { name: /Discard & continue|放弃并继续/ }).click();
  await expect(language).toHaveValue("zh");
  await subject.fill("中文草稿保留");
  await page.getByRole("button", { name: /^Save draft$|^保存草稿$/ }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /Draft saved|草稿已保存/ })
      .first(),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /Alex Chen/ }).click();
  await expect(language).toHaveValue("zh");
  await expect(subject).toHaveValue("中文草稿保留");
});

test("Changing monthly filters discards an in-flight select-all response", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const native = window.fetch;
    window.fetch = async (input, init) => {
      const response = await native(input, init);
      if (String(input).includes("/followups/selection?")) {
        (window as any).selectionStarted = true;
        await new Promise<void>((resolve) => ((window as any).releaseSelection = resolve));
      }
      return response;
    };
  });
  await page.getByRole("checkbox", { name: /^(Select |选择 )Alex Chen$/ }).check();
  await page.getByRole("button", { name: /Select all matches|选择全部匹配用户/ }).click();
  await expect.poll(() => page.evaluate(() => (window as any).selectionStarted)).toBe(true);
  await filter(page).selectOption("exhausted");
  await expect(rows(page)).toHaveCount(1);
  await page.evaluate(() => (window as any).releaseSelection());
  await expect(page.getByRole("checkbox", { name: /^(Select |选择 )Riley$/ })).toBeEnabled();
  await expect(page.getByRole("checkbox", { name: /^(Select |选择 )Riley$/ })).not.toBeChecked();
  await expect(page.getByRole("button", { name: /^(Bulk email|群发邮件)/ })).toHaveCount(0);
});
