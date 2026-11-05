import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { monitoringPreview } from "../../apps/ui/src/features/admin/service-health-preview";
import { sampleServiceMetrics } from "../../apps/ui/src/features/admin/service-metrics-model";

async function mount(page: Page, mode: "normal" | "empty" | "unavailable" = "normal") {
  const calls = {
    metrics: [] as string[],
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
    );
    if (mode === "empty") {
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
  await page.route(/\/api\/admin\/monitoring(?:\?|$)/, (route) =>
    route.fulfill({ json: monitoringPreview() }),
  );
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
    return route.fulfill({ status: 503, json: { error: "BUSINESS_ANALYTICS_UNAVAILABLE" } });
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
  await expect(panel.locator(".metricChart")).toHaveCount(4);
  await expect(panel.locator(".serviceMetricTotals strong").first()).not.toHaveText("—");
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
  await page.screenshot({ path: info.outputPath("service-metrics.png"), fullPage: true });
});

test("Metrics load on entry, selected scope and explicit refresh, without background polling", async ({
  page,
}) => {
  await page.clock.install();
  const { panel, calls } = await mount(page);
  await expect(panel.locator(".metricChart")).toHaveCount(4);
  expect(calls.metrics).toHaveLength(1);
  await page.clock.fastForward(120000);
  expect(calls.metrics).toHaveLength(1);
  await panel.getByRole("combobox", { name: /^(Period|时间范围)$/ }).selectOption("1");
  await expect.poll(() => calls.metrics.length).toBe(2);
  await expect(panel.locator(".metricChart")).toHaveCount(4);
  await panel.getByRole("combobox", { name: /^(Module|业务模块)$/ }).selectOption("apps");
  await expect.poll(() => calls.metrics.length).toBe(3);
  await expect(panel.locator(".metricChart")).toHaveCount(4);
  await panel.getByRole("button", { name: /Refresh monitoring|刷新监控/ }).click();
  await expect.poll(() => calls.metrics.length).toBe(4);
  expect(new URL(calls.metrics.at(-1)!).searchParams.get("domain")).toBe("apps");
});

test("No latency samples remain blank and never become a zero-latency healthy signal", async ({
  page,
}) => {
  const { panel } = await mount(page, "empty");
  await expect(panel.locator(".serviceMetricTotals strong").nth(2)).toHaveText("—");
  await expect(panel.locator(".metricChart").nth(2).locator("svg path")).toHaveCount(0);
  await expect(panel.locator(".serviceMetricPanel")).toContainText(
    /not complete Worker traffic|不代表 Worker 全量流量/,
  );
});

test("Unavailable metrics preserve independent failure investigation and never invent preview values", async ({
  page,
}) => {
  const { panel } = await mount(page, "unavailable");
  await expect(panel.locator(".serviceMetricPanel [role=alert]")).toBeVisible();
  await expect(panel.locator(".metricChart")).toHaveCount(0);
  await expect(panel.locator(".serviceMetricTotals strong").first()).toHaveText("—");
  await expect(panel.locator(".healthIssue")).toHaveCount(4);
});

test("Independent Admin sections do not reload account history or unrelated contacts", async ({
  page,
}) => {
  const { panel, calls } = await mount(page);
  await panel
    .locator(".adminSidebar")
    .getByRole("button", { name: /Business analytics|经营分析/ })
    .click();
  await expect.poll(() => calls.analytics).toBe(1);
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
