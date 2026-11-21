import { test, expect } from "./fixtures";

// The home page's platform section is a short header and four linked cards, each
// with a small picture of that part working, and every brand mark loads.
test("The home platform section links its four parts, each with a picture", async ({
  page,
}, info) => {
  const zh = info.project.metadata.language === "zh",
    prefix = zh ? "/zh" : "";
  await page.goto(prefix + "/");
  const section = page.getByRole("region", {
    name: zh ? /让 AI 跨应用与电脑完成真实工作的基础设施/ : /Agent infrastructure for real work/,
  });
  await section.scrollIntoViewIfNeeded();
  await expect(section.locator(".homePlatformAside p")).toHaveCount(1);
  const pillars = section.locator(".platformPillar");
  await expect(pillars).toHaveCount(4);
  const hrefs = await pillars.evaluateAll((links) => links.map((a) => a.getAttribute("href")));
  expect(hrefs).toEqual([
    prefix + "/integrations",
    prefix + "/docs/device-fleet",
    prefix + "/arc",
    prefix + "/docs/computer-use",
  ]);
  for (const image of await section.locator(".pillarApps img, .pillarFleet img").all())
    expect(
      await image.evaluate((img: HTMLImageElement) => img.decode().then(() => img.naturalWidth)),
    ).toBeGreaterThan(0);
  await expect(section.locator(".pillarFleet li[data-picked]")).toHaveCount(1);
  await expect(section.locator(".pillarRoutine li[data-done]")).toHaveCount(4);
  await expect(section.locator(".pillarDesktopNotice")).toContainText(
    zh ? "AI 正在使用这台电脑" : "AI is using this computer",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

// Every top-level page's title uses the home page's face, weight and size.
test("Top-level pages share the home page's title type", async ({ page }, info) => {
  // Twenty pages, one visit each.
  test.setTimeout(120000);
  const prefix = info.project.metadata.language === "zh" ? "/zh" : "";
  const type = () =>
    page
      .locator("main h1")
      .first()
      .evaluate((h) => {
        const style = getComputedStyle(h);
        return [style.fontFamily, style.fontWeight, style.fontSize, style.letterSpacing].join(" ");
      });
  await page.goto(prefix + "/");
  const home = await type();
  for (const path of [
    "/connect-ai",
    "/arc",
    "/chrome-extension",
    "/integrations",
    "/pricing",
    "/downloads",
    "/use-cases",
    "/use-cases/remote-development",
    "/docs",
    "/demo",
    "/remote-mcp",
    "/security-model",
    "/blogs",
    "/releases",
    "/roadmap",
    "/about",
    "/careers",
    "/feedback",
    "/support",
  ]) {
    await page.goto(prefix + path);
    await expect(page.locator("main h1").first()).toBeVisible();
    expect(await type(), path).toBe(home);
  }
});
