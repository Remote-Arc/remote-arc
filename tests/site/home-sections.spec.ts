import { test, expect } from "./fixtures";

// Pricing follows the hero, as on the Codex and Claude Code pages: one card per
// offered plan, each linking to that plan on /pricing.
test("Pricing follows the proof band and links each plan to its card on /pricing", async ({
  page,
}, info) => {
  const zh = info.project.metadata.language === "zh",
    prefix = zh ? "/zh" : "";
  await page.goto(prefix + "/");
  const pricing = page.getByRole("region", {
    name: zh ? /免费开始，工作多了再升级/ : /Start free\. Upgrade when the work grows\./,
  });
  await expect(pricing.locator(".homePricingPlan")).toHaveCount(3);
  await expect(pricing.locator(".homePricingPlan[data-featured]")).toHaveCount(1);
  const hrefs = await pricing
    .locator(".homePricingPlan > a")
    .evaluateAll((links) => links.map((a) => a.getAttribute("href")));
  for (const href of hrefs) expect(href).toMatch(new RegExp("^" + prefix + "/pricing#[a-z0-9-]+$"));
  // Paid plans say they include Arc, and a callout explains it keeps working while you're away.
  await expect(pricing.locator(".homePricingPlan .homePricingArc")).toHaveCount(2);
  await expect(pricing.locator(".homePricingArcCallout a")).toHaveAttribute(
    "href",
    prefix + "/arc",
  );
  const order = await page.evaluate(() =>
    [".homeProof", ".homePricing", ".homePlatformIntro"].map(
      (selector) => document.querySelector(selector)!.getBoundingClientRect().top,
    ),
  );
  expect(order[0]).toBeLessThan(order[1]!);
  expect(order[1]).toBeLessThan(order[2]!);
});

// The technical docs come before the closing call, and every card opens a real page.
test("The technical docs section links six guides and references that load", async ({
  page,
}, info) => {
  const zh = info.project.metadata.language === "zh",
    prefix = zh ? "/zh" : "";
  await page.goto(prefix + "/");
  const docs = page.getByRole("region", {
    name: zh ? /技术细节，一次看全/ : /Get the technical rundown\./,
  });
  const cards = docs.locator("a.homeDocsCard");
  await expect(cards).toHaveCount(6);
  for (const href of await cards.evaluateAll((links) => links.map((a) => a.getAttribute("href")))) {
    expect(href).toMatch(new RegExp("^" + prefix + "/(docs|security-model)"));
    expect((await page.request.get(href!)).ok(), href!).toBe(true);
  }
  await expect(docs.locator(".homeDocsChangelog")).toHaveAttribute("href", prefix + "/releases");
  await expect(page.locator(".homeDocs + .homeClosing")).toHaveCount(1);
});

// Section headlines with two sentences show the second one in the quieter tone.
test("Two-sentence section headlines set the second sentence apart", async ({ page }, info) => {
  const zh = info.project.metadata.language === "zh";
  await page.goto(zh ? "/zh" : "/");
  const heading = page.locator("#how-it-works h2");
  await expect(heading.locator(".sectionTitleRest")).toHaveCount(1);
  await expect(heading).toHaveText(
    zh ? "在聊天里说需求，看它把事做完。" : "Ask in chat. Watch the work get done.",
  );
});

// "Ask in chat" plays seven requests in the chat demo, each tab under a real
// company's logo; the notes under it pick one, and the get-started menu lists every way in.
test("Ask in chat plays seven requests, the notes choose them, and Get Remote Arc lists the ways in", async ({
  page,
}, info) => {
  const zh = info.project.metadata.language === "zh",
    prefix = zh ? "/zh" : "";
  await page.goto(prefix + "/");
  const section = page.locator("#how-it-works");
  const demo = section.locator(".homeDemo");
  await expect(demo).toHaveAttribute("data-scenario", "slack");
  const notes = section.locator(".homeUseCasesNotes button");
  await expect(notes).toHaveCount(7);
  const tabs = demo.locator(".homeDemoExamples button");
  await expect(tabs).toHaveCount(7);
  for (const icon of [
    "/app-brands/slack.svg",
    "/app-brands/whatsapp.svg",
    "/app-brands/github.svg",
    "/platform-brands/windows.svg",
    "/platform-brands/browser.svg",
    "/platform-brands/macos.svg",
    "/platform-brands/linux.svg",
  ])
    await expect(tabs.locator(`img[src="${icon}"]`)).toHaveCount(1);
  await notes.nth(2).click();
  await expect(demo).toHaveAttribute("data-scenario", "github");
  await notes.nth(6).click();
  await expect(demo).toHaveAttribute("data-scenario", "fleet");
  await expect(notes.nth(6)).toHaveAttribute("aria-pressed", "true");
  await expect(demo.locator(".homeUseCasesFleetGrid i")).toHaveCount(128);
  await expect(demo.locator('.homeUseCasesFleetGrid i[data-state="warn"]')).toHaveCount(3);
  await demo.locator(".homeDemoExamples button").nth(1).click();
  await expect(demo).toHaveAttribute("data-scenario", "whatsapp");
  await expect(notes.nth(1)).toHaveAttribute("aria-pressed", "true");

  const get = section.locator(".homeUseCasesGetButton");
  await get.click();
  const menu = section.locator(".homeUseCasesMenu");
  await expect(menu).toBeVisible();
  await expect(menu.locator('a[href$="/downloads"]')).toHaveCount(1);
  await expect(menu.locator('a[href*="/install/"]')).toHaveCount(4);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(section.locator(".homeUseCasesGet code")).toHaveText(
    "curl -fsSL https://remotearc.app/install.sh | sh",
  );
});

// The website is dark only: no theme switch, whatever was saved before.
test("The website stays dark and its nav menus end on this computer's agent download", async ({
  page,
}, info) => {
  const prefix = info.project.metadata.language === "zh" ? "/zh" : "";
  await page.goto(prefix + "/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".publicNav .themeSwitch")).toHaveCount(0);
  // The hero button gains its platform after hydration, so the menu below can open.
  await expect(page.locator(".heroDownloadAgent")).toHaveAttribute("data-platform", "linux");
  const menuTrigger = page.locator(".publicNavMenuTrigger").first();
  if (!(await menuTrigger.isVisible())) await page.locator(".publicMobileMenu").click();
  await menuTrigger.click();
  const card = page.locator("#public-nav-product .publicMegaAgent");
  await expect(card).toBeVisible();
  await expect(card.locator(".publicMegaAgentButton")).toHaveAttribute(
    "href",
    "/api/downloads/agent/linux/amd64",
  );
});

// Under "Works with the AI you use": Chrome opens the extension's store page,
// and the apps scroll past in two rows that loop without a seam.
test("The trust rail links Chrome to its store and app logos scroll beneath it", async ({
  page,
}, info) => {
  const prefix = info.project.metadata.language === "zh" ? "/zh" : "";
  await page.goto(prefix + "/");
  const rail = page.locator(".homeProof .trustRail");
  const chrome = rail.locator('a[href^="https://chromewebstore.google.com/"]');
  await expect(chrome).toHaveCount(1);
  await expect(chrome).toHaveAttribute("target", "_blank");
  await expect(rail.locator(".miniMcp")).toHaveCount(0);
  const marquee = page.locator(".appLogoMarquee");
  await expect(marquee.locator(".appLogoMarqueeRow")).toHaveCount(2);
  const first = marquee.locator(".appLogoMarqueeRow").first();
  const visible = first.locator("ul:not([aria-hidden]) a");
  const copy = first.locator('ul[aria-hidden="true"] a');
  expect(await visible.count()).toBeGreaterThan(5);
  expect(await copy.count()).toBe(await visible.count());
  await expect(visible.first()).toHaveAttribute("href", /\/integrations\?provider=/);
});
