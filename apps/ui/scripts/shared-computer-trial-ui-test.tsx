// A Free account with no trial because another account used it on the same
// computer is told why on the dashboard; Admin sees the linked accounts.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import React from "react";
// @ts-expect-error Test renderer is provided by this workspace.
import { act, create } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator, loadLocale, type Locale } from "../src/locales/locale-catalog.js";
import { I18nContext } from "../src/app/i18n-context.js";
import type { MonthlyUsage } from "../src/types/app-types.js";

// Node cannot load the components' stylesheets; styles are not under test.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith(".css"))
      return { url: "data:text/javascript,export default {}", shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { UsageConversionBanner } = await import("../src/features/dashboard/usage-conversion.js");
const { AdminSharedComputers } = await import("../src/features/admin/shared-computer-accounts.js");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
await loadLocale("en", "all");
await loadLocale("zh", "all");
const month = new Date().toISOString().slice(0, 7);

function withI18n(locale: Locale, node: React.ReactNode) {
  const tr = createTranslator(locale);
  return (
    <I18nContext.Provider value={{ locale, tr, setLocale: async () => true }}>
      {node}
    </I18nContext.Provider>
  );
}
const banner = (locale: Locale, usage: MonthlyUsage) =>
  renderToStaticMarkup(
    withI18n(
      locale,
      <UsageConversionBanner usage={usage} onManagePlan={() => {}} pricingUrl="/pricing" />,
    ),
  );
const base = { month, limit: 10000, unlimited: false };
const slowLaneAhead = (reason?: "shared_computer"): MonthlyUsage => ({
  ...base,
  used: 9000,
  remaining: 1000,
  afterAllowance: {
    next: "slow_lane",
    trialDays: 7,
    slowLaneCallsPerMinute: 2,
    ...(reason ? { trialUnavailableReason: reason } : {}),
  },
});
const inSlowLane = (reason?: "shared_computer"): MonthlyUsage => ({
  ...base,
  used: 10000,
  remaining: 0,
  freeOverflow: {
    trialDays: 7,
    slowLaneCallsPerMinute: 2,
    trial: null,
    trialAvailable: false,
    slowLaneCallsThisMonth: 3,
    ...(reason ? { trialUnavailableReason: reason } : {}),
  },
});

// Dashboard: a shared computer is named as the reason, in both languages.
assert.match(banner("en", slowLaneAhead("shared_computer")), /once per computer/);
assert.match(banner("en", inSlowLane("shared_computer")), /another account on this computer/);
assert.match(banner("zh", slowLaneAhead("shared_computer")), /每台电脑只提供一次/);
assert.match(banner("zh", inSlowLane("shared_computer")), /这台电脑上的另一个账号已经用过/);
// Other slow-lane accounts keep the existing wording.
assert.doesNotMatch(banner("en", slowLaneAhead()), /computer/);
assert.doesNotMatch(banner("en", inSlowLane()), /computer/);
assert.match(banner("en", inSlowLane()), /2 a minute/);

// Admin: the card lists the linked account and says the trial was withheld.
type Reply = { status: number; body?: unknown };
async function renderAdmin(locale: Locale, reply: Reply) {
  const requested: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string) => {
    requested.push(String(input));
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status });
  }) as typeof fetch;
  let renderer!: ReturnType<typeof create>;
  try {
    await act(async () => {
      renderer = create(withI18n(locale, <AdminSharedComputers userId="user-1" />));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  } finally {
    globalThis.fetch = original;
  }
  const text = JSON.stringify(renderer.toJSON());
  renderer.unmount();
  return { text, requested };
}
const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
const blocked = {
  status: 200,
  body: {
    rulesActive: true,
    trialEndsAt: null,
    trialBlockedBySharedComputer: true,
    accounts: [
      {
        userId: "user-2",
        email: "second@example.test",
        name: "Second",
        match: "hostname",
        computer: "DESKTOP-TEST123",
        trialEndsAt: future,
      },
    ],
  },
};
const admin = await renderAdmin("en", blocked);
assert.deepEqual(admin.requested, ["/api/admin/shared-computers?userId=user-1"]);
for (const expected of [
  "No trial: already used",
  "Second",
  "second@example.test",
  "DESKTOP-TEST123",
  "Same Windows hostname",
  "Trial until",
])
  assert(admin.text.includes(expected), "admin card shows " + expected);
const adminZh = await renderAdmin("zh", blocked);
assert(adminZh.text.includes("无试用：共用电脑已用过"));
assert(adminZh.text.includes("Windows 主机名相同"));

const alone = await renderAdmin("en", {
  status: 200,
  body: {
    rulesActive: false,
    trialEndsAt: null,
    trialBlockedBySharedComputer: false,
    accounts: [],
  },
});
assert(alone.text.includes("No other account uses"), "an account alone says so");
assert(alone.text.includes("rules are off"), "inactive rules are stated");
assert(!alone.text.includes("No trial: already used"), "no blocked badge without a block");

const failed = await renderAdmin("en", { status: 500 });
assert(failed.text.includes("Could not load shared computers."), "a failed request is reported");

console.log(
  "PASS: the dashboard names a shared computer as the reason for no trial in English and Chinese while other slow-lane accounts keep their wording, and the Admin card lists linked accounts, the match, their trial state and a withheld trial, says when the rules are off, and reports load failures",
);
