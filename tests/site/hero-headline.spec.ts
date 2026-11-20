import { expect, test } from "@playwright/test";

// The hero headline is one sentence in two parts, the second set in the accent.
test("The hero headline connects your AI to your apps and computers, with no product tabs", async ({
  page,
}, info) => {
  const zh = info.project.metadata.language === "zh";
  await page.goto(zh ? "/zh" : "/");
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveAccessibleName(
    zh ? /你的 AI，连接到\s*你的应用和电脑。/ : /Your AI, connected to\s*your apps and computers\./,
  );
  await expect(heading.locator("em")).toHaveText(
    zh ? "你的应用和电脑。" : "your apps and computers.",
  );
  // The only tabs in the hero choose the install command, not a product.
  await expect(page.locator(".homeHero").getByRole("tab", { name: /^(Connect|Arc)$/ })).toHaveCount(
    0,
  );
  await expect(page.locator(".homeHero").getByRole("tab")).toHaveText(["npx", "curl"]);
  // Visitors without an AI of their own are offered Arc, under the install command.
  await expect(page.locator(".homeHero a.heroArcAction")).toHaveAttribute(
    "href",
    zh ? "/zh/arc" : "/arc",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
