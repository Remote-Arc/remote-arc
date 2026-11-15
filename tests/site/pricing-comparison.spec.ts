import { test, expect } from "./fixtures";

// The comparison table shows the catalog's terms side by side, and each card says
// who it is for and has an anchor other pages link to.
for (const variant of ["", "?pricing=bundled"])
  test(
    "Pricing compares every plan and links each card by anchor " + (variant || "(default)"),
    async ({ page }, info) => {
      const zh = info.project.metadata.language === "zh";
      await page.goto((zh ? "/zh" : "") + "/pricing" + variant);
      const cards = page.locator(".pricingPlans--saas .planCard");
      await expect(cards.first()).toBeVisible();
      const count = await cards.count();
      for (let index = 0; index < count; index++)
        await expect(cards.nth(index).locator(".planAudience")).not.toBeEmpty();
      await expect(page.locator("#free")).toBeVisible();
      await expect(page.locator("#pro, #max").first()).toBeVisible();

      const table = page.getByRole("table");
      const computers = table.getByRole("row").filter({
        has: page.getByRole("rowheader", { name: zh ? "电脑" : "Computers", exact: true }),
      });
      await expect(
        page.getByRole("heading", { name: zh ? "对比所有套餐" : "Compare every plan" }),
      ).toBeVisible();
      const plans = (await page.evaluate(async () => {
        const catalog = await (await fetch("/api/billing/catalog")).json();
        return catalog.plans;
      })) as { label: string; deviceLimit: number | null; connectToolCalls: number | null }[];
      const shown = await page
        .locator(".pricingPlans--saas .planHeader > span:first-child")
        .allInnerTexts();
      for (const label of shown) {
        const plan = plans.find((item) => item.label.toUpperCase() === label.trim().toUpperCase())!;
        expect(plan, label + " is in the catalog").toBeTruthy();
        // Every shown plan has a column; its computer count is the catalog's.
        if (info.project.name.startsWith("desktop"))
          await expect(table.getByRole("columnheader", { name: plan.label })).toBeVisible();
        if (plan.deviceLimit !== null)
          await expect(computers.locator(`td[data-label="${plan.label}"]`)).toHaveText(
            plan.deviceLimit.toLocaleString(zh ? "zh-CN" : "en-US"),
          );
      }
      // Free states what happens after its allowance; safety comes with every plan.
      await expect(table).toContainText(zh ? "只能用读取类工具" : "read tools only");
      await expect(
        table.getByRole("rowheader", {
          name: zh ? "Safety Guard、Undo 和权限设置" : "Safety Guard, Undo and permissions",
        }),
      ).toBeVisible();
    },
  );
