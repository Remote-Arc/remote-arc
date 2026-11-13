import { loadLocale } from "../src/locales/locale-catalog.js";
import { initialLocale } from "../src/locales/locale-preference.js";
import assert from "node:assert/strict";
import React from "react";
// @ts-expect-error Test renderer is provided by this workspace.
import { act, create } from "react-test-renderer";
import { registerHooks } from "node:module";
import { I18nProvider } from "../src/app/i18n.js";
import { monitoringPreview } from "../src/features/admin/service-health-preview.js";
import { sampleServiceMetrics } from "../src/features/admin/service-metrics-model.js";
import { groupIncidents } from "../src/features/admin/service-health-model.js";
const css = registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith(".css"))
      return { url: "data:text/javascript,export default {}", shortCircuit: true };
    return next(specifier, context);
  },
});
const { ServiceHealth } = await import("../src/features/admin/service-health.js");
css.deregister();
const original = {
  fetch: globalThis.fetch,
  window: (globalThis as any).window,
  location: (globalThis as any).location,
  document: (globalThis as any).document,
};
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).location = {
  hostname: "admin.remotearc.app",
  pathname: "/overview",
  search: "?lang=en",
};
(globalThis as any).window = { location: (globalThis as any).location };
(globalThis as any).document = { documentElement: { lang: "en" } };
const requests: { url: string; resolve: (response: Response) => void }[] = [];
globalThis.fetch = async (input) => {
  const url = new URL(String(input), "https://admin.remotearc.app");
  if (url.pathname === "/api/admin/analytics")
    return Response.json({ error: "BUSINESS_ANALYTICS_UNAVAILABLE" }, { status: 503 });
  if (url.pathname === "/api/admin/metrics")
    return Response.json(
      sampleServiceMetrics(
        Number(url.searchParams.get("hours") || 24),
        url.searchParams.get("domain") || "",
        true,
      ),
    );
  return new Promise<Response>((resolve) => requests.push({ url: String(input), resolve }));
};
let root: any;
const tree = () => JSON.stringify(root.toJSON());
const answer = async (index: number, body: unknown, status = 200) =>
  act(async () => {
    requests[index]!.resolve(Response.json(body, { status }));
  });
try {
  await act(async () => {
    await loadLocale(initialLocale(), "all");
    root = create(
      <I18nProvider>
        <ServiceHealth health={null} loading={false} reload={() => {}} />
      </I18nProvider>,
    );
  });
  assert.equal(requests.length, 1);
  assert(tree().includes("Loading observations"));
  await act(async () =>
    root.root.findByProps({ "aria-label": "Period" }).props.onChange({ target: { value: "168" } }),
  );
  assert.equal(requests.length, 2);
  await answer(1, monitoringPreview());
  const stale = monitoringPreview();
  stale.summary.total = 999;
  await answer(0, stale);
  const summary = root.root
    .findByProps({ className: "healthMetrics" })
    .findAllByType("strong")
    .map((node: any) => node.children.join(""));
  assert.equal(summary[0], "27");
  assert(!summary.includes("999"), "Stale summaries cannot replace the selected period");
  const cards = () => root.root.findAllByProps({ className: "healthIssueSummary" });
  await act(async () => cards()[0].props.onClick());
  const firstDetail = requests.length - 1;
  await act(async () => cards()[1].props.onClick());
  const secondDetail = requests.length - 1;
  const fresh = monitoringPreview(true);
  fresh.events[0]!.userName = "Current Device Owner";
  await answer(secondDetail, fresh);
  const old = monitoringPreview(true);
  old.events[0]!.userName = "Stale Billing Owner";
  await answer(firstDetail, old);
  assert(tree().includes("Current Device Owner"));
  assert(
    !tree().includes("Stale Billing Owner"),
    "Late detail responses cannot cross users or selected errors",
  );
  const refresh = root.root.findByProps({ "aria-label": "Refresh monitoring" });
  await act(async () => refresh.props.onClick());
  await answer(requests.length - 1, { error: "observability_unavailable" }, 503);
  assert.equal(root.root.findAllByProps({ className: "healthEvent" }).length, 0);
  assert(tree().includes("Monitoring data is unavailable"));
  assert(!tree().includes("Current Device Owner"));
  await act(async () => refresh.props.onClick());
  await answer(requests.length - 1, monitoringPreview());
  assert.equal(root.root.findAllByProps({ className: "healthIssueSummary" }).length, 4);
  const reference = root.root.findAllByType("details").find((node: any) => node.props.onToggle);
  await act(async () => reference.props.onToggle({ currentTarget: { open: true } }));
  await answer(requests.length - 1, {
    catalog: monitoringPreview().groups.map((g) => g.definition),
  });
  assert(tree().includes("catalogued codes"));
  const search = root.root.findByProps({ "aria-label": "Search error reference" });
  await act(async () => search.props.onChange({ target: { value: "DEVICE_TIMEOUT" } }));
  assert.equal(
    root.root.findAllByProps({ className: "healthCatalog" })[0].findAllByType("details").length,
    1,
  );
  const groups = groupIncidents([
    { id: "1", created_at: "x", severity: "error", kind: "http_5xx", message: "HTTP 500" },
    {
      id: "2",
      created_at: "x",
      severity: "error",
      kind: "exception",
      message: "Error: details omitted",
    },
    {
      id: "3",
      created_at: "x",
      severity: "error",
      kind: "exception",
      message: "D1_ERROR: unavailable",
    },
  ]);
  assert.deepEqual(
    groups.map((group) => group.key),
    ["http", "exceptions", "database"],
  );
  console.log(
    "PASS: real health component rejects stale summary/detail responses, clears failed refreshes, supports retry/reference search and groups sanitized infrastructure issues",
  );
} finally {
  if (root) await act(async () => root.unmount());
  globalThis.fetch = original.fetch;
  for (const key of ["window", "location", "document"] as const) {
    if (original[key] === undefined) delete (globalThis as any)[key];
    else (globalThis as any)[key] = original[key];
  }
}
