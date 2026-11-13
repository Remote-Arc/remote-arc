// The devices page explains paused computers and lets the person choose which
// stay active: no more than the plan's limit can be selected, the chosen ones
// are sent first, and a changed list is reported instead of saved.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error Test renderer is provided by this workspace.
import { act, create } from "react-test-renderer";
import { loadLocale } from "../src/locales/locale-catalog.js";
import type { Device } from "../src/types/app-types.js";

// Node cannot load the component's stylesheet; styles are not under test.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith(".css"))
      return { url: "data:text/javascript,export default {}", shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { I18nProvider } = await import("../src/app/i18n.js");
const { ComputerPlanLimit } =
  await import("../src/features/dashboard/devices/computer-plan-limit.js");

const originalFetch = globalThis.fetch;
const originalLocation = (globalThis as any).location;
const originalWindow = (globalThis as any).window;
const originalDocument = (globalThis as any).document;
(globalThis as any).location = {
  hostname: "admin.remotearc.app", // Keeps client telemetry out of this isolated test.
  pathname: "/dashboard/devices",
  search: "",
};
(globalThis as any).window = { location: (globalThis as any).location };
(globalThis as any).document = { documentElement: {} };

const computer = (id: string, position: number, paused: boolean, limit = 2): Device => ({
  id,
  name: "Computer " + id,
  platform: "linux",
  arch: null,
  hostname: id + ".local",
  created_at: "2026-01-01T00:00:00Z",
  last_seen: null,
  status: "offline",
  tools: [],
  plan_paused: paused,
  plan_position: position,
  computer_limit: limit,
});
const browser: Device = {
  ...computer("browser", 0, false),
  platform: "browser",
  plan_position: null,
};

try {
  await loadLocale("en", "dashboard");
  await loadLocale("zh", "dashboard");
  const page = (devices: Device[], refreshAll = async () => {}, language = "en") => (
    <I18nProvider initialLanguage={language as "en"}>
      <ComputerPlanLimit devices={devices} refreshAll={refreshAll} />
    </I18nProvider>
  );

  // Nothing paused, nothing shown.
  assert.equal(renderToStaticMarkup(page([computer("a", 0, false), browser])), "");

  // Listed out of order on purpose: the chooser follows plan_position.
  const devices = [
    computer("d", 3, true),
    computer("b", 1, false),
    browser,
    computer("a", 0, false),
    computer("c", 2, true),
  ];
  const markup = renderToStaticMarkup(page(devices));
  assert.match(markup, /2 of your 4 computers are paused/);
  assert.match(markup, /Your plan includes 2 computers/);
  assert.match(markup, /href="\/checkout\?product=pro"/);
  assert.match(
    renderToStaticMarkup(page(devices, undefined, "zh")),
    /你的 4 台电脑中有 2 台已暂停/,
  );

  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const requests: { url: string; body: { device_ids: string[] } }[] = [];
  let answer = () => new Response(JSON.stringify({ ok: true }), { status: 200 });
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    requests.push({ url, body: JSON.parse(String(init.body)) });
    return answer();
  }) as typeof fetch;
  let refreshes = 0;
  let root: ReturnType<typeof create>;
  await act(async () => {
    root = create(
      page(devices, async () => {
        refreshes++;
      }),
    );
  });
  const button = (label: RegExp) =>
    root!.root.findAll(
      (node: any) => node.type === "button" && label.test(JSON.stringify(node.children)),
    )[0];
  const boxes = () => root!.root.findAll((node: any) => node.type === "input");
  const names = () =>
    root!.root
      .findAll((node: any) => node.props.className === "computerPlanLimitName")
      .map((node: any) => node.children.join(""));

  await act(async () => button(/Choose active computers/).props.onClick());
  assert.deepEqual(names(), ["Computer a", "Computer b", "Computer c", "Computer d"]);
  assert.deepEqual(
    boxes().map((box: any) => [box.props.checked, box.props.disabled]),
    [
      [true, false],
      [true, false],
      [false, true],
      [false, true],
    ],
    "The active computers start selected and no third can be added",
  );

  // Swap a for d: unselect a, then d becomes selectable.
  await act(async () => boxes()[0].props.onChange());
  await act(async () => boxes()[3].props.onChange());
  await act(async () => boxes()[2].props.onChange()); // Ignored: already at the limit.
  assert.deepEqual(
    boxes().map((box: any) => box.props.checked),
    [false, true, false, true],
  );
  await act(async () => button(/^\["Save"\]$/).props.onClick());
  assert.deepEqual(requests, [
    { url: "/api/devices/order", body: { device_ids: ["b", "d", "a", "c"] } },
  ]);
  assert.equal(refreshes, 1);
  assert.equal(boxes().length, 0, "The chooser closes after saving");

  // A list that changed meanwhile is reported and refreshed, not saved.
  answer = () => new Response(JSON.stringify({ error: "DEVICE_ORDER_CHANGED" }), { status: 409 });
  await act(async () => button(/Choose active computers/).props.onClick());
  await act(async () => button(/^\["Save"\]$/).props.onClick());
  assert.match(JSON.stringify(root!.toJSON()), /Your computers changed/);
  assert.equal(refreshes, 2);
  assert.ok(boxes().length > 0, "The chooser stays open to choose again");
  await act(async () => root!.unmount());

  console.log(
    "PASS: paused computers are explained with a Pro checkout link; the chooser follows plan order, caps selection at the plan limit, sends chosen computers first and reports a changed list",
  );
} finally {
  globalThis.fetch = originalFetch;
  (globalThis as any).location = originalLocation;
  (globalThis as any).window = originalWindow;
  (globalThis as any).document = originalDocument;
}
