import { test, expect } from "./fixtures";

// The computer use page: what it is, the notice the person sees, how to start,
// and that every plan includes it, with the trial and plan links.
test("The computer use page explains the feature and links the trial and plans", async ({
  page,
}, info) => {
  const zh = info.project.metadata.language === "zh",
    prefix = zh ? "/zh" : "";
  await page.goto(prefix + "/computer-use");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    zh ? "让 AI 操作没有 API 的应用" : "Let your AI use the apps that have no API",
  );
  await expect(page.locator(".featureDesktopNotice")).toContainText(
    zh ? "移动鼠标即可接手" : "move the mouse to take over",
  );
  await expect(
    page.getByRole("link", { name: zh ? /为电脑开启/ : /Turn it on for a computer/ }),
  ).toHaveAttribute("href", /\/dashboard\/connect\/devices$/);
  await expect(
    page.getByRole("link", { name: zh ? /了解工作方式/ : /How it works/ }),
  ).toHaveAttribute("href", /\/docs\/computer-use$/);
  const plans = page.locator(".featurePlanCard");
  await expect(plans).toHaveCount(3);
  await expect(
    plans.nth(1).getByRole("link", { name: zh ? /开始 Pro 试用/ : /Start the Pro trial/ }),
  ).toHaveAttribute("href", /\/checkout\?product=pro&trial=1$/);
  const product = page.getByRole("button", { name: zh ? /产品/ : /Product/ }).first();
  if (await product.isVisible()) {
    await product.click();
    await expect(
      page
        .locator("#public-nav-product")
        .getByRole("link", { name: zh ? "Computer Use" : "Computer use" }),
    ).toHaveAttribute("href", /\/computer-use$/);
  }
});
