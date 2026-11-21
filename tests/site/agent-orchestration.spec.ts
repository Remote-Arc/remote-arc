import { test, expect } from "./fixtures";

// Agent Orchestration: agents side by side, each a conversation the person can
// continue, with Claude's subscription windows above.
test("Agent Orchestration shows agents side by side and continues a conversation", async ({
  page,
}, info) => {
  const zh = info.project.metadata.language === "zh";
  await page.goto("/dashboard/connect/orchestration?run=ar_00000000a001,ar_00000000a002");
  await expect(
    page.getByRole("heading", { level: 1, name: zh ? "Agent 编排" : "Agent Orchestration" }),
  ).toBeVisible();

  const quota = page.locator(".orchQuota");
  await expect(quota).toContainText("34%");
  await expect(quota).toContainText("21%");

  const fixer = page.getByRole("article", { name: "Fix the flaky date parser test" });
  const pager = page.getByRole("article", { name: "Add pagination to the orders API" });
  if (info.project.use.viewport!.width >= 900) {
    await expect(fixer).toBeVisible();
    await expect(pager).toBeVisible();
    const [a, b] = [await fixer.boundingBox(), await pager.boundingBox()];
    expect(Math.abs(a!.y - b!.y)).toBeLessThan(4); // side by side
  }
  await expect(fixer.locator(".orchTool.is-error")).toContainText(
    "npm test -- date-parser --repeat 20",
  );
  await expect(fixer).toContainText(zh ? /改动 3 个文件/ : /3 files changed · \+18 −6/);

  // The working agent cannot take a message until it replies.
  await expect(pager.getByRole("textbox")).toBeDisabled();
  await expect(pager.getByRole("button", { name: zh ? "停止" : "Stop" })).toBeVisible();

  const box = fixer.getByRole("textbox");
  await box.fill("Now add a regression test for midnight UTC");
  await fixer.getByRole("button", { name: zh ? "发送" : "Send" }).click();
  await expect(fixer.locator(".orchBubble.is-user").last()).toHaveText(
    "Now add a regression test for midnight UTC",
  );
  await expect(box).toBeDisabled();
  await expect(fixer).toContainText("Done. The new test covers", { timeout: 15_000 });
  await expect(box).toBeEnabled();
  await page.screenshot({ path: info.outputPath("orchestration.png"), fullPage: false });
});

// The public page: what it is, where to start, and each plan with its upgrade and trial links.
test("The Agent Orchestration page explains the feature and links the trial and plans", async ({
  page,
}, info) => {
  const zh = info.project.metadata.language === "zh",
    prefix = zh ? "/zh" : "";
  await page.goto(prefix + "/agent-orchestration");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    zh
      ? "在每台电脑上并排运行你的编程 Agent"
      : "Run your coding agents on every computer, side by side",
  );
  await expect(
    page.getByRole("link", { name: zh ? /打开 Agent 编排/ : /Open Agent Orchestration/ }),
  ).toHaveAttribute("href", /\/dashboard\/connect\/orchestration$/);
  const plans = page.locator(".featurePlanCard");
  await expect(plans).toHaveCount(3);
  await expect(plans.nth(0)).toContainText(zh ? "一次一个 Agent" : "One agent at a time");
  await expect(
    plans.nth(1).getByRole("link", { name: zh ? /开始 Pro 试用/ : /Start the Pro trial/ }),
  ).toHaveAttribute("href", /\/checkout\?product=pro&trial=1$/);
  await expect(
    plans.nth(2).getByRole("link", { name: zh ? /购买 Max/ : /Get Max/ }),
  ).toHaveAttribute("href", /\/checkout\?product=arc-pro-v1$/);
  await expect(page.locator(".featureRelated a").first()).toHaveAttribute(
    "href",
    /\/docs\/agent-orchestration$/,
  );

  // The Product menu lists it beside the browser extension.
  const product = page.getByRole("button", { name: zh ? /产品/ : /Product/ }).first();
  if (await product.isVisible()) {
    await product.click();
    await expect(
      page
        .locator("#public-nav-product")
        .getByRole("link", { name: zh ? "Agent 编排" : "Agent Orchestration" }),
    ).toHaveAttribute("href", /\/agent-orchestration$/);
  }
});
