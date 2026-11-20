import { test, expect } from "./fixtures";

// The home page reveals sections below the fold as they scroll in, never hides
// what is already on screen, and shows everything at once with reduced motion.
test("Home sections below the fold fade in on scroll, and stay put with reduced motion", async ({
  page,
}, info) => {
  const prefix = info.project.metadata.language === "zh" ? "/zh" : "";
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(prefix + "/");
  const home = page.locator(".homePage");
  await expect(home).toHaveAttribute("data-reveal-ready", "");

  // The hero is in view at load, so it is never hidden.
  await expect(page.locator(".heroCopy h1")).toBeVisible();
  const platformIntro = page.locator(".homePlatformHeader");
  const below = page.locator("#docs .modernSectionIntro");
  await expect(below).toHaveAttribute("data-reveal", "item");
  await expect(below).not.toHaveAttribute("data-revealed", "");
  expect(await below.evaluate((element) => getComputedStyle(element).opacity)).toBe("0");

  await below.scrollIntoViewIfNeeded();
  await expect(below).toHaveAttribute("data-revealed", "");
  await expect.poll(() => below.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
  // Grids reveal their cards one after another.
  const pillars = page.locator(".platformPillars");
  await expect(pillars).toHaveAttribute("data-reveal", "group");
  await platformIntro.scrollIntoViewIfNeeded();
  await expect(pillars).toHaveAttribute("data-revealed", "");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(home).not.toHaveAttribute("data-reveal-ready", "");
  await expect(page.locator(".homePage [data-reveal]")).toHaveCount(0);
  await expect(page.locator("#docs .modernSectionIntro")).toHaveCSS("opacity", "1");
});

// The page ends on one call to action: connect, the setup guide and the install command.
test("Home ends on one closing call to action with the install command", async ({ page }, info) => {
  const zh = info.project.metadata.language === "zh";
  await page.goto(zh ? "/zh" : "/");
  const closing = page.getByRole("region", {
    name: zh ? /沿用你的 AI，连接自己的电脑/ : /Keep your AI\. Connect your computer\./,
  });
  await expect(closing).toHaveAttribute("id", "connect-your-computer");
  await expect(closing.locator("a.primaryButton")).toHaveAttribute(
    "href",
    /\/dashboard\/connect\/overview$/,
  );
  await expect(closing.locator('a[href="/connect-ai"]')).toHaveCount(1);
  await expect(closing.locator(".installCommands code")).toHaveText(
    "curl -fsSL https://remotearc.app/install.sh | sh",
  );
  // The duplicate platform and security sections are gone from the home page.
  await expect(page.locator(".landingSetup, .homeSecurityIntro")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

// The hero arc plays one request per beat: a streak of light runs along its route, the AI that
// asked and then its target light up, and the line below says what it did. With
// reduced motion it holds still.
test("The hero arc routes and logs one request per beat, and holds still with reduced motion", async ({
  page,
}, info) => {
  const prefix = info.project.metadata.language === "zh" ? "/zh" : "";
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(prefix + "/");
  const arc = page.locator(".homeArc");
  await expect(arc).toHaveAttribute("data-running", "true");
  await expect(arc.locator(".homeArcTrail")).toHaveCount(1);
  await expect(arc.locator(".homeArcNode[data-lit]")).toHaveCount(1);
  const log = arc.locator(".homeArcLog li");
  await expect(log).toHaveCount(1);
  const before = await log.first().innerText();
  await expect.poll(() => log.first().innerText(), { timeout: 8000 }).not.toBe(before);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(arc).toHaveAttribute("data-running", "false");
  await expect(arc.locator(".homeArcTrail")).toHaveCount(0);
  await expect(arc.locator(".homeArcNode[data-lit]")).toHaveCount(0);
  await expect(log).toHaveCount(1);
});
