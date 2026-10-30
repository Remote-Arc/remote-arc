import { test, expect } from "./fixtures";

test("tools are discoverable and searchable with real contracts", async ({
  page,
}, testInfo) => {
  const zh = testInfo.project.metadata.language === "zh";
  await page.goto(zh ? "/zh/docs" : "/docs");
  const search = page.getByRole("searchbox");
  await search.fill("fleet_sync_workspace");
  const card = page
    .locator(".docsHubGroup")
    .getByRole("link", { name: /Tool directory|全部工具/ });
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    zh ? "所有工具，一处查全。" : "Every tool, in one place.",
  );
  await expect(page.locator(".toolCatalogRow")).toHaveCount(1);
  await expect(page.locator(".toolCatalogRow code").first()).toHaveText(
    "fleet_sync_workspace",
  );
  const query = page.getByRole("searchbox");
  await query.fill("browser_runner_act");
  await page.locator("#remote-browser_runner_act summary").click();
  await expect(page.locator(".toolCatalogContract pre")).toContainText(
    "idempotency_key",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `work/tools-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("tab", { name: /App actions|Apps 操作/ }).click();
  await query.fill("issues.create");
  await page
    .getByLabel(zh ? "应用" : "App", { exact: true })
    .selectOption("github");
  await expect(page.locator(".toolCatalogRow")).toHaveCount(1);
  await page
    .getByLabel(zh ? "操作类型" : "Access", { exact: true })
    .selectOption("read");
  await expect(page.locator(".toolCatalogRow")).toHaveCount(0);
  await page.getByRole("tab", { name: /Local MCP|本地 MCP/ }).click();
  await query.fill("list_undo_actions");
  await expect(page.locator(".toolCatalogRow")).toHaveCount(1);
});

test("new guides and tool inventory have working deep links", async ({
  page,
}, testInfo) => {
  const prefix = testInfo.project.metadata.language === "zh" ? "/zh" : "";
  for (const path of [
    "/docs/tools?type=apps&app=slack",
    "/docs/slack",
    "/docs/codex",
    "/docs/browser",
  ]) {
    await page.goto(prefix + path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/Guide not found|未找到指南/)).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("tool directory shows which AI clients support each tool", async ({
  page,
}, testInfo) => {
  const zh = testInfo.project.metadata.language === "zh";
  await page.goto((zh ? "/zh" : "") + "/docs/tools?type=remote");
  const filter = page.getByRole("group", {
    name: zh ? "按 AI 客户端查看工具" : "Show tools for an AI client",
  });
  for (const name of ["ChatGPT", "Claude", "Cursor", "Gemini"])
    await expect(filter.getByRole("button", { name })).toBeVisible();
  const skill = page.locator("#remote-read_skill");
  await expect(skill.locator(".toolClientSupport")).toContainText("ChatGPT");
  await expect(
    skill.locator(".toolClientUnavailable img[src='/ai-claude.svg']"),
  ).toBeVisible();
  await expect(
    page.locator("#remote-list_devices .toolClientSupport"),
  ).toHaveCount(0);
  const total = await page.locator(".toolCatalogRow").count();
  await filter.getByRole("button", { name: "Claude" }).click();
  await expect(page).toHaveURL(/client=claude/);
  await expect(page.locator(".toolCatalogRow")).toHaveCount(total - 2);
  await expect(skill).toHaveCount(0);
  await page.getByRole("tab", { name: /App actions|Apps 操作/ }).click();
  await page
    .getByLabel(zh ? "应用" : "App", { exact: true })
    .selectOption("runway");
  await expect(page.locator(".toolCatalogRow")).toHaveCount(0);
  await filter.getByRole("button", { name: "ChatGPT" }).click();
  await expect(page.locator(".toolCatalogRow").first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `work/tool-clients-${testInfo.project.name}.png`,
    fullPage: false,
  });
});
