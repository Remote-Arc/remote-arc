import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

type Plan = {
  id: string;
  label: string;
  monthlyCredits: number;
  connectToolCalls: number | null;
  deviceLimit: number | null;
  concurrentRuns: number;
  maxSeconds: number;
  maxSteps?: number;
  routines?: number;
  connectionLimit?: number;
};

// The page reads the same catalog, so the expected terms come from it too.
const catalogPlans = (page: Page) =>
  page.evaluate(async () => {
    const catalog = await (await fetch("/api/billing/catalog")).json();
    return catalog.plans as Plan[];
  });
const formatted = (page: Page, value: number) => page.evaluate((n) => n.toLocaleString(), value);

for (const variant of ["", "?pricing=bundled"])
  test(
    "Every pricing card opens its full plan terms " + (variant || "(default)"),
    async ({ page }, info) => {
      const prefix = info.project.metadata.language === "zh" ? "/zh" : "";
      await page.goto(prefix + "/pricing" + variant);
      const cards = page.locator(".pricingPlans--saas .planCard");
      await expect(cards.first()).toBeVisible();
      const plans = await catalogPlans(page);
      const count = await cards.count();
      expect(count).toBeGreaterThanOrEqual(3);

      for (let index = 0; index < count; index++) {
        const card = cards.nth(index);
        const label = (await card.locator(".planHeader > span").first().innerText()).trim();
        const plan = plans.find((item) => item.label.toUpperCase() === label.toUpperCase());
        expect(plan, label + " is a catalog plan").toBeTruthy();
        const trigger = card.getByRole("button", {
          name: new RegExp("^(See full plan details for |查看全部套餐内容：)" + plan!.label + "$"),
        });
        await expect(trigger).toHaveAttribute("aria-haspopup", "dialog");

        // Keyboard: Enter opens, focus moves into the dialog, Escape returns it.
        await trigger.focus();
        await page.keyboard.press("Enter");
        const dialog = page.getByRole("dialog", {
          name: new RegExp("^" + plan!.label + " (plan|套餐)$"),
        });
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole("button", { name: /^(Close|关闭)$/ })).toBeFocused();

        const term = (key: string) => dialog.locator(`.planDetailsRow[data-term="${key}"] dd`);
        await expect(term("computers")).toContainText(
          plan!.deviceLimit === null ? /Unlimited|无限/ : await formatted(page, plan!.deviceLimit),
        );
        await expect(term("connect-calls")).toContainText(
          plan!.connectToolCalls === null
            ? /Unlimited|无限/
            : await formatted(page, plan!.connectToolCalls),
        );
        await expect(term("credits")).toContainText(
          plan!.monthlyCredits > 0
            ? await formatted(page, plan!.monthlyCredits)
            : /Not included|不包含/,
        );
        await expect(term("concurrent")).toHaveText(await formatted(page, plan!.concurrentRuns));
        await expect(term("time")).toContainText(String(plan!.maxSeconds / 60));
        if (plan!.maxSteps != null)
          await expect(term("steps")).toContainText(String(plan!.maxSteps));
        if (plan!.connectionLimit != null)
          await expect(term("apps")).toContainText(await formatted(page, plan!.connectionLimit));
        await expect(term("transfer")).toContainText(
          plan!.id === "free" ? "2 GB" : /Unlimited|无限/,
        );

        // The dialog fits the viewport without sideways scrolling.
        const fits = await dialog.evaluate((element) => {
          const { left, right, bottom } = element.getBoundingClientRect();
          return left >= 0 && right <= innerWidth + 0.5 && bottom <= innerHeight + 0.5;
        });
        expect(fits, label + " dialog inside the viewport").toBe(true);

        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
      }
    },
  );

test("Pro and Max cards compare the same terms, with Credits as tasks", async ({ page }, info) => {
  const prefix = info.project.metadata.language === "zh" ? "/zh" : "";
  await page.goto(prefix + "/pricing?pricing=bundled");
  const cards = page.locator(".pricingPlans--saas .planCard");
  await expect(cards).toHaveCount(3);
  const plans = await catalogPlans(page);
  const rows = async (label: string) =>
    (
      await cards
        .filter({
          has: page.locator(".planHeader > span", { hasText: new RegExp("^" + label + "$") }),
        })
        .locator(".planIncluded li")
        .allInnerTexts()
    ).map((row) => row.replace(/^✓\s*/, "").trim());
  const proRows = await rows("PRO"),
    maxRows = await rows("MAX");
  expect(maxRows).toHaveLength(proRows.length);
  for (const [label, cardRows] of [
    ["Pro", proRows],
    ["Max", maxRows],
  ] as const) {
    const plan = plans.find((item) => item.label === label)!;
    const minutes = String(plan.maxSeconds / 60);
    const at = (pattern: RegExp) => cardRows.findIndex((row) => pattern.test(row));
    const computers = at(
        new RegExp("\\b" + (await formatted(page, plan.deviceLimit!)) + "\\b.*(computers|台电脑)"),
      ),
      runs = at(new RegExp("\\b" + plan.concurrentRuns + "\\b.*\\b" + minutes + "\\b")),
      credits = at(
        new RegExp(
          (await formatted(page, plan.monthlyCredits)).replace(",", "\\,") + ".*(about|约) [\\d,]+",
        ),
      );
    expect(computers, label + " computers").toBeGreaterThanOrEqual(0);
    expect(runs, label + " concurrent runs and minutes").toBe(computers + 1);
    expect(credits, label + " Credits with a task estimate").toBeGreaterThan(runs);
  }
  await expect(page.locator(".pricingFinePrint")).toContainText(/per typical task|每次任务约/);
});

test("Plan details close from the close button and the backdrop", async ({ page }, info) => {
  const prefix = info.project.metadata.language === "zh" ? "/zh" : "";
  await page.goto(prefix + "/pricing?pricing=bundled");
  const trigger = page.locator(".planCard.featuredPlan .planDetailsButton");
  await trigger.click();
  const dialog = page.locator("dialog.planDetailsDialog");
  await expect(dialog).toBeVisible();
  // A modal dialog makes the page behind it inert, so focus cannot leave it.
  expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(true);
  await dialog.getByRole("button", { name: /^(Close|关闭)$/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(dialog).toBeVisible();
  // The backdrop is the dialog element outside its panel.
  await page.mouse.click(4, 4);
  await expect(dialog).toHaveCount(0);
});
