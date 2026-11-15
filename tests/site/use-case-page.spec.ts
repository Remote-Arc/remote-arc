import { test, expect } from "./fixtures";

// The use case page opens on six personas, then four featured use cases: one persona
// is shown at a time, its tasks copy as they are, and its plan link highlights that
// plan on the pricing page.
test("Use cases open on a persona picker that copies tasks and links pricing, then featured cases", async ({
  page,
  context,
}, info) => {
  const zh = info.project.metadata.language === "zh",
    prefix = zh ? "/zh" : "";
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(prefix + "/use-cases");

  // The persona picker is the first screen, ahead of the featured cases.
  const firstTabs = page.getByRole("tablist");
  await expect(firstTabs).toBeInViewport();
  expect(
    await page.evaluate(() => {
      const personas = document.querySelector(".personaShowcase")!,
        featured = document.querySelector(".featuredUseCases")!;
      return Boolean(personas.compareDocumentPosition(featured) & Node.DOCUMENT_POSITION_FOLLOWING);
    }),
  ).toBe(true);

  const featured = page.locator(".featuredUseCases .featuredCase");
  await expect(featured).toHaveCount(4);
  await expect(featured.first()).toHaveAttribute(
    "href",
    prefix + "/use-cases/remote-development?mode=connect",
  );
  await expect(featured.first().locator(".featuredPrompt blockquote")).not.toBeEmpty();

  const tabs = page.getByRole("tablist", {
    name: zh ? "选一个最像你的身份" : "Choose the role closest to yours",
  });
  const panel = page.getByRole("tabpanel");
  await expect(tabs.getByRole("tab")).toHaveCount(6);
  const plans = new Set<string>();
  for (const tab of await tabs.getByRole("tab").all()) {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(panel).toHaveCount(1);
    expect(await panel.locator(".personaTasks li").count()).toBeGreaterThanOrEqual(3);
    const portrait = panel.locator(".personaPortrait img");
    expect(
      await portrait.evaluate((image: HTMLImageElement) =>
        image.decode().then(() => image.naturalWidth),
      ),
    ).toBeGreaterThan(0);
    const href = (await panel.locator(".personaPlan").getAttribute("href")) ?? "";
    expect(href).toMatch(new RegExp("^" + prefix + "/pricing#(pro|max)$"));
    plans.add(href);
  }
  expect(plans.size, "both Pro and Max are recommended").toBe(2);

  // A link opened fresh shows its persona, and the arrow keys move between them.
  await page.goto(prefix + "/pricing");
  await page.goto(prefix + "/use-cases#for-ops");
  await expect(panel).toHaveAttribute("id", "for-ops");
  await tabs.getByRole("tab", { selected: true }).press("ArrowRight");
  await expect(panel).toHaveAttribute("id", "for-remote-server");
  await expect(page).toHaveURL(/#for-remote-server$/);
  await tabs.getByRole("tab", { selected: true }).press("ArrowLeft");
  await expect(panel).toHaveAttribute("id", "for-ops");

  const firstTask = panel.locator(".personaTasks li").first();
  const text = (await firstTask.locator("p").innerText()).trim();
  await firstTask.getByRole("button").click();
  await expect(firstTask.getByRole("button")).toContainText(zh ? "已复制" : "Copied");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(text);

  await panel.locator(".personaPlan").click();
  await expect(page).toHaveURL(new RegExp(prefix + "/pricing#max$"));
  await expect(page.locator("#max")).toBeVisible();
  // The linked plan is the highlighted one, not Pro.
  await expect(page.locator(".planCard.featuredPlan")).toHaveAttribute("id", "max");
  await expect(page.locator("#max")).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

// A use case offers Connect and Arc as two cards; each shows its own prompt, steps
// and facts, the prompt copies as it is, and Arc's opens a draft in Arc.
test("A use case page switches between Connect and Arc and copies the prompt", async ({
  page,
  context,
}, info) => {
  const zh = info.project.metadata.language === "zh",
    prefix = zh ? "/zh" : "";
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(prefix + "/use-cases/remote-development");
  const modes = page.getByRole("group", { name: zh ? "选择工作方式" : "Choose how to work" });
  const connect = modes.getByRole("button", { name: zh ? /使用 Connect/ : /With Connect/ }),
    arc = modes.getByRole("button", { name: zh ? /使用 Arc/ : /With Arc/ });
  await expect(connect).toHaveAttribute("aria-pressed", "true");
  await expect(arc).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".caseHeroArt img")).toHaveAttribute(
    "src",
    "/use-case-art/remote-development.svg",
  );
  await expect(page.locator(".caseSteps li")).toHaveCount(3);
  await expect(page.locator(".caseFact")).toHaveCount(3);
  await expect(page.locator(".caseFact .caseTools")).toContainText("edit_block");

  const card = page.locator(".casePromptCard");
  const connectPrompt = (await card.locator(".casePrompt").innerText()).trim();
  await card.getByRole("button").click();
  await expect(card.getByRole("button")).toContainText(zh ? "已复制" : "Copied");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(connectPrompt);

  await arc.click();
  await expect(page).toHaveURL(/\?mode=arc$/);
  await expect(arc).toHaveAttribute("aria-pressed", "true");
  await expect(card.getByRole("heading")).toHaveText(zh ? "向 Arc 提出请求" : "Ask Arc");
  await expect(card.locator(".casePrompt")).not.toHaveText(connectPrompt);
  await expect(
    card.getByRole("link", { name: zh ? /在 Arc 中开始/ : /Start in Arc/ }),
  ).toHaveAttribute("href", /\/dashboard\/agent\/chat/);
  await expect(page.locator(".caseFact .caseTools")).toHaveCount(0);

  // A Connect-only use case has no Arc card.
  await page.goto(prefix + "/use-cases/job-applications?mode=arc");
  await expect(page.locator(".caseConnectOnly")).toBeVisible();
  await expect(page.locator(".caseModes")).toHaveCount(0);
  await expect(page.locator(".casePromptCard h2")).toHaveText(
    zh ? "在 AI 聊天中提出请求" : "Ask in your AI chat",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
