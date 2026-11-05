import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { monitoringPreview } from "../../apps/ui/src/features/admin/service-health-preview";
import { sampleServiceMetrics } from "../../apps/ui/src/features/admin/service-metrics-model";
import { businessHealthFixture } from "./business-analytics-fixture";

async function mount(page: Page, mode: "normal" | "empty" | "unavailable" = "normal") {
  const calls = {
    metrics: [] as string[],
    monitoring: [] as string[],
    operations: [] as string[],
    submissions: 0,
    analytics: 0,
  };
  await page.route(/\/api\/admin\/metrics(?:\?|$)/, (route) => {
    const url = new URL(route.request().url());
    calls.metrics.push(url.href);
    if (mode === "unavailable")
      return route.fulfill({ status: 503, json: { error: "METRICS_UNAVAILABLE" } });
    const value = sampleServiceMetrics(
      Number(url.searchParams.get("hours") || 24),
      url.searchParams.get("domain") || "",
      true,
    );
    if (mode === "empty") {
      value.modules = value.modules.map((item) => ({ ...item, failures: 0, attention: 0 }));
      value.points = value.points.map((point) => ({
        ...point,
        requests: 0,
        serverErrors: 0,
        clientErrors: 0,
        slowRequests: 0,
        failures: 0,
        attention: 0,
        affectedUsers: 0,
        affectedDevices: 0,
        p50Ms: null,
        p95Ms: null,
      }));
      value.totals = {
        requests: 0,
        serverErrors: 0,
        clientErrors: 0,
        slowRequests: 0,
        failures: 0,
        attention: 0,
        p50Ms: null,
        p95Ms: null,
      };
    }
    return route.fulfill({ json: value });
  });
  await page.route(/\/api\/admin\/monitoring(?:\?|$)/, (route) => {
    calls.monitoring.push(route.request().url());
    return route.fulfill({ json: monitoringPreview() });
  });
  await page.route(/\/api\/monitor(?:\?|$)/, (route) =>
    route.fulfill({
      json: {
        status: "healthy",
        checkedAt: new Date().toISOString(),
        worker: { status: "healthy", errors15m: 0, errors1h: 0, errors24h: 0 },
        dependencies: { d1: { status: "healthy" }, durableObjects: { status: "healthy" } },
        alerts: { emailConfigured: false, destination: null, recent: [] },
        account: { users: 1, devices: 1, activeTokens: 1 },
        incidents: [],
      },
    }),
  );
  await page.route(/\/api\/admin\/operations(?:\?|$)/, (route) => {
    calls.operations.push(route.request().url());
    return route.fulfill({
      json: {
        checkedAt: new Date().toISOString(),
        month: "2026-11",
        page: 0,
        pageSize: 30,
        creditsReady: true,
        totals: {
          users: 0,
          devices: 0,
          online: 0,
          auditRows: null,
          auditLast7d: 0,
          monthlyCalls: 0,
        },
        limits: { free: 10000, plus: 10000 },
        users: [],
        devices: [],
        activity: [],
        filteredTotal: 0,
        activationCounts: {},
        billing: { actualUsd: null, source: "unavailable", billingUrl: "", note: "", services: [] },
      },
    });
  });
  await page.route(/\/api\/admin\/submissions(?:\?|$)/, (route) => {
    calls.submissions++;
    return route.fulfill({ json: { items: [], total: 0, page: 0, pageSize: 20, counts: [] } });
  });
  await page.route(/\/api\/admin\/analytics(?:\?|$)/, (route) => {
    calls.analytics++;
    const url = new URL(route.request().url());
    if (url.searchParams.get("view") !== "health")
      return route.fulfill({ status: 503, json: { error: "BUSINESS_ANALYTICS_UNAVAILABLE" } });
    return route.fulfill({
      json: businessHealthFixture(Number(url.searchParams.get("days") || 1)),
    });
  });
  await page.addInitScript(() => {
    (window as Window & { metricsTestFetch?: typeof fetch }).metricsTestFetch =
      window.fetch.bind(window);
  });
  await page.goto("/admin-preview?section=health");
  await expect(page.locator(".adminShell")).toBeVisible();
  await page.addScriptTag({ type: "module", url: "/scripts/admin-console-browser-fixture.tsx" });
  const panel = page.locator("#admin-console-fixture");
  await expect(panel.locator(".healthIssue")).toHaveCount(4);
  return { panel, calls };
}

test("Metrics have coordinate axes, exact values and keyboard interaction on desktop and mobile", async ({
  page,
}, info) => {
  const { panel, calls } = await mount(page);
  await expect(panel.locator(".metricChart")).toHaveCount(1);
  const overview = panel.locator(".businessHealthKpis");
  await expect(
    overview
      .locator("article")
      .filter({ hasText: /Confirmed payments|已确认付款笔数/ })
      .locator("strong"),
  ).toHaveText("13");
  await expect(
    overview
      .locator("article")
      .filter({ hasText: /Completed registrations|注册成功数/ })
      .locator("strong"),
  ).toHaveText("17");
  await expect(
    overview
      .locator("button")
      .filter({ hasText: /Sign-in completion|登录完成率/ })
      .locator("strong"),
  ).toHaveText("60%");
  await expect(
    overview
      .locator("button")
      .filter({ hasText: /Purchase completion|购买流程完成率/ })
      .locator("strong"),
  ).toHaveText("50%");
  await expect(panel.locator(".businessAnalytics,.businessGrowth,.businessRetention")).toHaveCount(
    0,
  );
  await expect(panel.locator(".serviceMetricTotals")).toHaveCount(0);
  for (const chart of await panel.locator(".metricChart").all()) {
    await expect(chart.locator("svg")).toHaveAttribute("tabindex", "0");
    expect(await chart.locator("svg text").count()).toBeGreaterThanOrEqual(9);
  }
  const chart = panel.locator(".metricChart").first();
  await chart.locator("svg").focus();
  await page.keyboard.press("Home");
  await expect(chart.locator(".metricCrosshair")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(chart.locator(".metricCrosshair")).toHaveCount(0);
  expect(calls.operations).toHaveLength(0);
  expect(calls.submissions).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await panel.evaluate((root) => {
    for (const element of root.querySelectorAll("*")) if (element.scrollTop) element.scrollTop = 0;
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: info.outputPath("service-metrics.png"), fullPage: true });
});

test("Metrics load on entry, selected scope and explicit refresh, without background polling", async ({
  page,
}) => {
  await page.clock.install();
  const { panel, calls } = await mount(page);
  await expect(panel.locator(".metricChart")).toHaveCount(1);
  expect(calls.metrics).toHaveLength(1);
  expect(new URL(calls.metrics[0]!).searchParams.get("view")).toBe("business");
  expect(calls.analytics).toBe(1);
  await page.clock.fastForward(120000);
  expect(calls.metrics).toHaveLength(1);
  await panel.getByRole("combobox", { name: /^(Period|时间范围)$/ }).selectOption("1");
  await expect.poll(() => calls.metrics.length).toBe(2);
  await expect(panel.locator(".metricChart")).toHaveCount(1);
  await panel.getByRole("combobox", { name: /^(Module|业务模块)$/ }).selectOption("apps");
  await expect.poll(() => calls.metrics.length).toBe(3);
  await expect(panel.locator(".metricChart")).toHaveCount(1);
  await panel.getByRole("button", { name: /Refresh monitoring|刷新监控/ }).click();
  await expect.poll(() => calls.metrics.length).toBe(4);
  expect(new URL(calls.metrics.at(-1)!).searchParams.get("domain")).toBe("apps");
});

test("Empty business errors remain explicit zero records without invented service metrics", async ({
  page,
}) => {
  const { panel } = await mount(page, "empty");
  for (const card of await panel.locator(".businessMetricCards button").all())
    await expect(card.locator("strong")).toHaveText("0");
  await expect(panel.locator(".metricChart")).toHaveCount(1);
  await expect(panel.locator(".serviceMetricPanel")).toContainText(
    /not unique failed users or orders|不等于失败用户数或订单数/,
  );
});

test("Unavailable metrics preserve independent failure investigation and never invent preview values", async ({
  page,
}) => {
  const { panel } = await mount(page, "unavailable");
  await expect(panel.locator(".serviceMetricPanel [role=alert]")).toBeVisible();
  await expect(panel.locator(".metricChart")).toHaveCount(0);
  await expect(
    panel
      .locator(".businessHealthKpis article")
      .filter({ hasText: /Confirmed payments|已确认付款笔数/ })
      .locator("strong"),
  ).toHaveText("13");
  for (const card of await panel.locator(".businessMetricCards button").all()) {
    await expect(card.locator("strong")).toHaveText("—");
    await expect(card).toBeDisabled();
  }
  await expect(panel.locator(".healthIssue")).toHaveCount(4);
});

test("Business module cards filter the recorded trends and the error investigation together", async ({
  page,
}) => {
  const { panel, calls } = await mount(page);
  await expect(panel.locator(".businessMetricCards button")).toHaveCount(5);
  const apps = panel.getByRole("button", { name: /View Apps metrics|查看App 连接指标/ });
  await expect(apps.locator("strong")).not.toHaveText("—");
  await apps.click();
  await expect(panel.getByRole("combobox", { name: /Module|业务模块/ })).toHaveValue("apps");
  await expect(panel.locator('.businessMetricCards button[aria-pressed="true"]')).toHaveCount(1);
  await expect.poll(() => new URL(calls.metrics.at(-1)!).searchParams.get("domain")).toBe("apps");
  await expect
    .poll(() => new URL(calls.monitoring.at(-1)!).searchParams.get("domain"))
    .toBe("apps");
  expect(calls.operations).toHaveLength(0);
  expect(calls.submissions).toBe(0);
  await panel.locator('.businessMetricCards button[aria-pressed="true"]').click();
  await expect(panel.getByRole("combobox", { name: /Module|业务模块/ })).toHaveValue("");
  await expect(panel.locator(".businessMetricCards button")).toHaveCount(5);
});

test("A business analytics outage clears acquisition and payment metrics while error investigation remains usable", async ({
  page,
}) => {
  const { panel } = await mount(page);
  await expect(
    panel
      .locator(".businessHealthKpis article")
      .filter({ hasText: /Confirmed payments|已确认付款笔数/ })
      .locator("strong"),
  ).toHaveText("13");
  await page.route(/\/api\/admin\/analytics(?:\?|$)/, (route) =>
    route.fulfill({ status: 503, json: { error: "BUSINESS_ANALYTICS_UNAVAILABLE" } }),
  );
  await panel.getByRole("button", { name: /Refresh business metrics|刷新业务指标/ }).click();
  await expect(panel.locator(".businessHealthError")).toBeVisible();
  for (const value of await panel.locator(".businessHealthKpis strong").all())
    await expect(value).toHaveText("—");
  await expect(panel.locator(".businessGrowth svg")).toHaveCount(0);
  await expect(panel.locator(".healthIssue")).toHaveCount(4);
  await expect(panel.locator(".metricChart")).toHaveCount(1);
});

test("Independent Admin sections do not reload account history or unrelated contacts", async ({
  page,
}) => {
  const { panel, calls } = await mount(page);
  await panel
    .locator(".adminSidebar")
    .getByRole("button", { name: /Business analytics|经营分析/ })
    .click();
  await expect.poll(() => calls.analytics).toBe(2);
  expect(calls.operations).toHaveLength(0);
  expect(calls.submissions).toBe(0);
  await panel
    .locator(".adminSidebar")
    .getByRole("button", { name: /Users & operations|用户与运营/ })
    .click();
  await expect.poll(() => calls.operations.length).toBe(1);
  expect(new URL(calls.operations[0]!).searchParams.get("auditTotals")).toBe("0");
  expect(calls.submissions).toBe(0);
});
