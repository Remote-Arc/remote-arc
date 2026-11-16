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
      })) as {
        label: string;
        deviceLimit: number | null;
        connectToolCalls: number | null;
        connectionLimit?: number;
        connectWriteCalls?: number | null;
      }[];
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
      // A write cap is stated beside the calls it sits within.
      const free = plans.find((item) => item.label === "Free")!;
      if (free.connectWriteCalls)
        await expect(
          table
            .getByRole("row")
            .filter({
              has: page.getByRole("rowheader", {
                name: zh ? "Connect 调用" : "Connect calls",
                exact: true,
              }),
            })
            .locator('td[data-label="Free"]'),
        ).toContainText(
          zh
            ? `修改类最多 ${free.connectWriteCalls.toLocaleString("zh-CN")} 次`
            : `up to ${free.connectWriteCalls.toLocaleString("en-US")} that change things`,
        );
      // Apps show how many accounts each plan connects, and routine use is its own row.
      const appsRow = table.getByRole("row").filter({
        has: page.getByRole("rowheader", {
          name: zh ? "应用连接（Gmail、GitHub、Slack 等）" : "Apps (Gmail, GitHub, Slack and more)",
        }),
      });
      for (const label of shown) {
        const plan = plans.find((item) => item.label.toUpperCase() === label.trim().toUpperCase())!;
        if (plan.connectionLimit)
          await expect(appsRow.locator(`td[data-label="${plan.label}"]`)).toHaveText(
            zh
              ? `最多 ${plan.connectionLimit.toLocaleString("zh-CN")} 个连接`
              : `Up to ${plan.connectionLimit.toLocaleString("en-US")} connections`,
          );
      }
      await expect(
        table.getByRole("rowheader", {
          name: zh ? "routine 里使用应用连接" : "Apps inside routines",
        }),
      ).toBeVisible();
      // Free states what happens after its allowance; safety comes with every plan.
      await expect(table).toContainText(zh ? "只能用读取类工具" : "read tools only");
      await expect(
        table.getByRole("rowheader", {
          name: zh ? "Safety Guard、Undo 和权限设置" : "Safety Guard, Undo and permissions",
        }),
      ).toBeVisible();
    },
  );

// A link to one plan (a use case's "See the Max plan") highlights that plan and
// brings it into view; without one, or for Free, the recommended plan stays Pro.
test("A pricing link to one plan highlights that plan", async ({ page }, info) => {
  const prefix = info.project.metadata.language === "zh" ? "/zh" : "";
  await page.goto(prefix + "/pricing#max");
  const featured = page.locator(".planCard.featuredPlan");
  await expect(featured).toHaveCount(1);
  await expect(featured).toHaveAttribute("id", "max");
  await expect(featured.locator(".planRibbon")).toHaveText(prefix ? "适合你" : "FITS YOUR WORK");
  await expect(featured.locator(".planActions a").first()).toHaveClass(/primaryButton/);
  await expect(page.locator("#pro .planActions a").first()).toHaveClass(/ghostButton/);
  await expect(featured).toBeInViewport();

  for (const hash of ["", "#free", "#nothing"]) {
    await page.goto(prefix + "/pricing" + hash);
    await expect(page.locator(".planCard.featuredPlan")).toHaveAttribute("id", "pro");
    await expect(page.locator(".planCard.featuredPlan .planRibbon")).toHaveText(
      prefix ? "推荐" : "RECOMMENDED",
    );
  }
});
