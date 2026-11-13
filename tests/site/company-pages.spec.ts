import { expect, test } from "@playwright/test";

test("About explains why Remote Arc exists and links to the story and careers", async ({
  page,
}, info) => {
  const zh = info.project.metadata.language === "zh";
  const prefix = zh ? "/zh" : "";
  await page.goto(prefix + "/about");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    zh ? "让 AI 能安全地在真实电脑上干活。" : "Making it safe for AI to work on real computers.",
  );
  await expect(page.locator(".companyGrid li")).toHaveCount(4);
  await expect(
    page.getByRole("link", {
      name: zh ? "阅读创立 Remote Arc 的初衷 →" : "Read why Remote Arc was built →",
    }),
  ).toHaveAttribute("href", prefix + "/blogs/why-i-built-remote-arc");
  await expect(
    page.getByRole("link", { name: zh ? "加入我们 →" : "Work with us →" }),
  ).toHaveAttribute("href", prefix + "/careers");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("Careers takes a note that needs contact consent, and sends nothing from the design preview", async ({
  page,
}, info) => {
  const zh = info.project.metadata.language === "zh";
  await page.goto((zh ? "/zh" : "") + "/careers");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    zh ? "一起打造 AI 的访问层。" : "Build the access layer for AI with us.",
  );
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/public/engagement"))
      posts.push(request.url());
  });

  const form = page.locator(".careersForm");
  const send = form.getByRole("button", { name: zh ? "提交" : "Send" });
  await expect(send).toBeDisabled();
  await form.getByLabel(zh ? "姓名" : "Name").fill("Ada Example");
  await form.getByLabel(zh ? "邮箱" : "Email", { exact: true }).fill("ada@example.com");
  await form.getByLabel(zh ? "你想做哪方面？" : "What would you work on?").selectOption("design");
  await form
    .getByLabel(zh ? "你想和我们一起做什么？" : "What would you like to build with us?")
    .fill("I would like to work on the dashboard design.");
  await form.getByRole("checkbox").check();
  await expect(send).toBeEnabled();
  await send.click();

  // The site tests run the UI preview, where submission storage is off.
  await expect(form.getByRole("alert")).toContainText(zh ? "设计预览" : "design preview");
  expect(posts).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
