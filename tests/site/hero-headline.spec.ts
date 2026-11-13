import { expect, test } from "@playwright/test";

test("The hero headline slides through Connect scenarios, and Arc's when the Arc tab is chosen", async ({
  page,
}, info) => {
  const zh = info.project.metadata.language === "zh";
  await page.goto(zh ? "/zh" : "/");
  const heading = page.getByRole("heading", { level: 1 });
  const words = page.locator(".heroSlotLine .heroSlotWord");

  // Screen readers get the whole sentence once; the sliding words are hidden from them.
  await expect(heading).toHaveAccessibleName(
    zh
      ? "Remote Arc：让你的 AI 接管每台服务器、每次发布、每周报表和整个机群。"
      : "Remote Arc: your AI runs every server, every release, your reports and the whole fleet.",
  );
  await expect(words).toHaveCount(4);
  // Reduced motion in the tests holds the first scenario in place.
  await expect(words.first()).toHaveAttribute("data-state", "active");
  await expect(words.first()).toHaveText(zh ? "每台服务器。" : "every server.");

  await page.getByRole("tab", { name: /^Arc/ }).click();
  await expect(heading).toHaveAccessibleName(
    zh
      ? "Remote Arc：让你的 AI 智能体负责晨间简报、销售报表、例行任务和后续跟进。"
      : "Remote Arc: your AI agent handles the morning briefing, the sales report, every routine and the follow-ups.",
  );
  await expect(words).toHaveCount(4);
  await expect(words.first()).toHaveText(zh ? "每天的晨间简报。" : "the morning briefing.");

  await page.getByRole("tab", { name: "Connect" }).click();
  await expect(words.first()).toHaveText(zh ? "每台服务器。" : "every server.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
