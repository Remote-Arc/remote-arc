import { test, expect } from "./fixtures";

test("Arc Tasks lists routines saved from an AI next to Arc's own and settles their decisions", async ({
  page,
}) => {
  await page.goto("/dashboard/agent/tasks");
  await expect(page.locator(".arcWorkGrid [data-task-id=sample-task]")).toBeVisible();
  const saved = page.locator(".connectTasksInArc");
  await expect(
    saved.getByRole("heading", { name: /Routines saved from your AI|从 AI 保存的例程/ }),
  ).toBeVisible();
  await expect(saved.locator(".connectTaskCard")).toHaveCount(4);
  // Arc's search and filters apply to both lists.
  await page.getByRole("searchbox", { name: /Search work|搜索/ }).fill("Daily store");
  await expect(saved.locator(".connectTaskCard")).toHaveCount(1);
  const routine = saved.locator("[data-task-id=preview-decision]");
  await expect(routine.locator(".taskDecision")).toContainText(/new access key/);
  await routine.getByRole("button", { name: /^(Retry now|现在重试)$/ }).click();
  await expect(routine.locator(".taskDecision")).toHaveCount(0);
  await page.getByRole("searchbox", { name: /Search work|搜索/ }).fill("");
  await page.getByRole("button", { name: /^(Recurring|重复)/ }).click();
  await expect(saved.locator("[data-task-id=preview-ci]")).toBeVisible();
  await expect(saved.locator("[data-task-id=preview-goal]")).toHaveCount(0);
  // A failure Arc could have repaired says what Arc would do and where to get it.
  const offline = saved.locator("[data-task-id=preview-offline]");
  await page.getByRole("button", { name: /^(All tasks|全部任务)/ }).click();
  await expect(offline.locator(".taskArcHint")).toContainText(
    /Arc could have fixed this failure on its own|本可以由 Arc 自己修好/,
  );
  await expect(offline.getByRole("link", { name: /See Arc plans|查看 Arc 套餐/ })).toHaveAttribute(
    "href",
    "/settings?section=billing",
  );
  await expect(saved.locator("[data-task-id=preview-ci] .taskArcHint")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("Connect's task page names saved routines and points to Arc Tasks", async ({ page }) => {
  await page.goto("/automations");
  await expect(
    page.getByRole("heading", { level: 1, name: /Routines saved from your AI|从 AI 保存的例程/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Open Arc tasks|打开 Arc 任务/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/agent\/tasks/);
  await expect(page.locator(".connectTasksInArc")).toBeVisible();
});
