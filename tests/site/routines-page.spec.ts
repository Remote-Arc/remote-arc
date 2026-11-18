import { test, expect } from "./fixtures";

test("Routines lists every routine, puts what needs you first and opens a routine's detail", async ({
  page,
}) => {
  await page.goto("/dashboard/agent/tasks");
  const rows = page.locator(".routineRow");
  // Arc's own tasks and the routines saved from an AI share one list.
  await expect(rows).toHaveCount(6);
  await expect(page.locator(".routineRow[data-routine-id=sample-task]")).toContainText(
    /Made in chat|在对话里创建/,
  );
  await expect(page.locator(".routineRow[data-routine-id=preview-ci]")).toContainText(
    /Saved from your AI|从 AI 保存/,
  );

  // What needs a person is first, with the decision's own actions.
  const needs = page.locator(".routinesNeeds article");
  await expect(needs).toHaveCount(3);
  const decision = page.locator(".routinesNeeds [data-routine-id=preview-decision]");
  await expect(decision).toContainText(/new access key/);
  await expect(page.locator(".routinesNeeds [data-routine-id=preview-offline]")).toContainText(
    /offline|离线/,
  );
  await expect(page.locator(".routinesNeeds [data-routine-id=sample-routine]")).not.toContainText(
    "PREVIEW_PARTIAL_SOURCE",
  );

  // Filters and search narrow the one list.
  await page.getByRole("button", { name: /^(Needs you|需要你) 3$/ }).click();
  await expect(rows).toHaveCount(3);
  await page.getByRole("button", { name: /^(All|全部) 6$/ }).click();
  await page.getByRole("searchbox", { name: /Search routines|搜索例程/ }).fill("Nightly");
  await expect(rows).toHaveCount(1);
  await page.getByRole("searchbox", { name: /Search routines|搜索例程/ }).fill("");

  // A routine's detail shows how it runs and settles its decision.
  await page.locator(".routineRow[data-routine-id=preview-decision]").click();
  const detail = page.locator(".routineDetail[data-routine-id=preview-decision]");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText(
    /Runs only if step 1 exits with code 0|仅当第 1 步退出码为 0 时运行/,
  );
  await expect(detail).toContainText("git checkout -- exports/");
  await expect(
    detail.getByRole("link", { name: /Choose Slack or webhook|选择 Slack 或 webhook/ }),
  ).toHaveAttribute("href", "/settings?section=notifications");
  await detail
    .locator(".taskDecision")
    .getByRole("button", { name: /^(Retry now|现在重试)$/ })
    .click();
  await expect(page.locator(".routinesNeeds [data-routine-id=preview-decision]")).toHaveCount(0);

  // A failure Arc could have repaired says so and links to the plans.
  if (page.viewportSize()!.width < 960)
    await detail.getByRole("button", { name: /All routines|全部例程/ }).click();
  await page.locator(".routineRow[data-routine-id=preview-offline]").click();
  const offline = page.locator(".routineDetail[data-routine-id=preview-offline]");
  await expect(offline.locator(".taskArcHint")).toBeVisible();
  await expect(offline.getByRole("link", { name: /See Arc plans|查看 Arc 套餐/ })).toHaveAttribute(
    "href",
    "/settings?section=billing",
  );

  // On a phone the detail replaces the list until you go back.
  if (page.viewportSize()!.width < 960) {
    await expect(page.locator(".routinesList")).toBeHidden();
    await offline.getByRole("button", { name: /All routines|全部例程/ }).click();
    await expect(page.locator(".routinesList")).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("A waiting routine can run now and turning one off asks to confirm", async ({ page }) => {
  await page.goto("/dashboard/agent/tasks");
  await page.locator(".routineRow[data-routine-id=sample-task]").click();
  const detail = page.locator(".routineDetail[data-routine-id=sample-task]");
  await expect(detail.getByRole("button", { name: /^(Run now|立即运行)$/ })).toBeVisible();
  await detail.getByRole("button", { name: /^(Turn off|关闭)$/ }).click();
  await expect(detail.getByRole("button", { name: /^(Confirm turn off|确认关闭)$/ })).toBeVisible();
});

test("Connect's task page is the same routines page, with Arc off too", async ({ page }) => {
  await page.route("**/api/runtime-config", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), arcAvailable: false } });
  });
  // An AI's link to a saved routine opens it in Connect and keeps the reference.
  await page.goto("/automations?task=preview-ci");
  await expect(page.locator(".appFrame")).toHaveAttribute("data-workspace", "connect");
  await expect(page.locator(".routinesPage")).toBeVisible();
  await expect(page).toHaveURL(/task=preview-ci/);
  await expect(page.locator(".routineDetail[data-routine-id=preview-ci]")).toContainText(
    "Merge after CI passes",
  );
  // Without Arc the list holds only the routines saved from an AI.
  if (page.viewportSize()!.width < 960)
    await page.getByRole("button", { name: /All routines|全部例程/ }).click();
  await expect(page.locator(".routineRow[data-routine-id=preview-ci]")).toBeVisible();
  await expect(page.locator(".routineRow[data-routine-id=sample-task]")).toHaveCount(0);
  await expect(page.locator(".routinesNeeds [data-routine-id=preview-offline]")).toBeVisible();
  await expect(page.locator(".routinesNeeds [data-routine-id=preview-decision]")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("A link to a routine older than the list loads it, and an unknown one says so", async ({
  page,
}) => {
  await page.goto("/dashboard/connect/tasks");
  await expect(page.locator(".routineRow[data-routine-id=preview-ci]")).toBeVisible();
  await page.evaluate(async () => {
    const original = window.fetch.bind(window),
      data = await (await original("/api/automations")).json();
    const older = { ...data.automations[1], id: "older-task", name: "Older saved command" };
    window.fetch = (async (input, init) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        location.href,
      );
      if (url.pathname === "/api/automations/older-task")
        return Response.json({ automation: older, runs: [] });
      if (url.pathname === "/api/automations/missing-task")
        return Response.json({ error: "NOT_FOUND" }, { status: 404 });
      return original(input, init);
    }) as typeof fetch;
    const url = new URL(location.href);
    url.searchParams.set("task", "older-task");
    history.pushState({}, "", url);
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.locator(".routineDetail[data-routine-id=older-task]")).toContainText(
    "Older saved command",
  );
  await page.evaluate(() => {
    const url = new URL(location.href);
    url.searchParams.set("task", "missing-task");
    history.pushState({}, "", url);
    dispatchEvent(new PopStateEvent("popstate"));
  });
  const missing = page.locator(".routinesPage").getByRole("status");
  await expect(missing).toContainText(/not found|没有找到/);
  await page.getByRole("button", { name: /Show all routines|显示全部例程/ }).click();
  await expect(page).not.toHaveURL(/task=missing-task/);
  await expect(missing).toHaveCount(0);
});

test("A failed action keeps the routine as it was and says why", async ({ page }) => {
  await page.goto("/dashboard/connect/tasks?task=preview-ci");
  const detail = page.locator(".routineDetail[data-routine-id=preview-ci]");
  await expect(detail).toBeVisible();
  await page.evaluate(() => {
    const original = window.fetch.bind(window);
    window.fetch = (async (input, init) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        location.href,
      );
      if (url.pathname.endsWith("/preview-ci/pause"))
        return Response.json({ error: "Simulated update failure" }, { status: 503 });
      return original(input, init);
    }) as typeof fetch;
  });
  await detail.getByRole("button", { name: /^(Pause|暂停)$/ }).click();
  await expect(detail.getByRole("alert")).toContainText("Simulated update failure");
  await expect(detail.getByRole("button", { name: /^(Pause|暂停)$/ })).toBeVisible();
});

test("Routines uses the same heading styles as Devices", async ({ page }) => {
  const headerStyles = () =>
    page.locator("main").evaluate((main) => {
      const properties = ["color", "font-size", "font-weight", "letter-spacing", "line-height"];
      const read = (element: Element) => {
        const style = getComputedStyle(element);
        return properties.map((property) => style.getPropertyValue(property));
      };
      const heading = main.querySelector("h1")!;
      return [read(heading), read(heading.nextElementSibling!)];
    });
  for (const workspace of ["connect", "agent"]) {
    await page.goto(`/dashboard/${workspace}/devices`);
    await expect(page.locator("main h1")).toBeVisible();
    const expected = await headerStyles();
    await page.goto(`/dashboard/${workspace}/tasks`);
    const title = page.getByRole("heading", { level: 1, name: /^(Routines|例程)$/ });
    await expect(title).toBeVisible();
    await expect.poll(headerStyles).toEqual(expected);
    const create = page.getByRole("button", { name: /^(New routine|新建例程)$/ }).first();
    await expect(create).toBeVisible();
  }
});

test("Dashboard headings stay in place when switching tabs", async ({ page }) => {
  await page.goto("/dashboard/connect/devices");
  const heading = page.locator(".dashboardMain h1");
  const readPosition = () =>
    heading.evaluate((title) => {
      const subtitle = title.nextElementSibling;
      return {
        title: title.getBoundingClientRect().top,
        subtitle: subtitle?.matches("p") ? subtitle.getBoundingClientRect().top : null,
      };
    });
  await expect(heading).toBeVisible();
  const baseline = await readPosition();
  const openTab = async (tab: string) => {
    const button =
      tab === "settings"
        ? page.getByRole("button", { name: /^(Settings|设置)$/ })
        : page.locator(`[data-dashboard-tab="${tab}"]:visible`);
    await button.first().click();
    await expect(page.locator(".appFrame")).toHaveAttribute("data-active-tab", tab);
    await expect(heading).toBeVisible();
  };

  for (const tab of ["automations", "apps", "connect", "settings", "overview", "devices"]) {
    await openTab(tab);
    await expect.poll(readPosition).toEqual(baseline);
  }

  await page.locator(".dashboardMain").evaluate((main) => {
    main.style.minHeight = "200vh";
    window.scrollTo({ top: 160, behavior: "instant" });
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await openTab("automations");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect.poll(readPosition).toEqual(baseline);
});
