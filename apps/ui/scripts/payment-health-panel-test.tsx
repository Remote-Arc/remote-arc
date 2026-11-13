import assert from "node:assert/strict";
import React from "react";
import { registerHooks } from "node:module";
// @ts-expect-error Test renderer is provided by this workspace.
import { act, create } from "react-test-renderer";
import { loadLocale } from "../src/locales/locale-catalog.js";
import { I18nProvider } from "../src/app/i18n.js";
import { samplePaymentHealth } from "../src/features/admin/payment-health-model.js";

const css = registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith(".css"))
      return { url: "data:text/javascript,export default {}", shortCircuit: true };
    return next(specifier, context);
  },
});
const { PaymentHealthPanel } = await import("../src/features/admin/payment-health-panel.js");
css.deregister();

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const setLocale = (lang: "en" | "zh") => {
  (globalThis as any).location = {
    hostname: "admin.remotearc.app",
    pathname: "/overview",
    search: "?lang=" + lang,
  };
  (globalThis as any).window = { location: (globalThis as any).location };
  (globalThis as any).document = { documentElement: { lang } };
};
const text = (node: any): string =>
  typeof node === "string" ? node : (node?.children || []).map(text).join("");
async function render(
  value: ReturnType<typeof samplePaymentHealth> | undefined,
  lang: "en" | "zh" = "en",
) {
  setLocale(lang);
  let root: any;
  await act(async () => {
    await loadLocale(lang, "all");
    root = create(
      <I18nProvider>
        <PaymentHealthPanel value={value} />
      </I18nProvider>,
    );
  });
  return root;
}

// Loading: no claims either way.
let root = await render(undefined);
assert.match(text(root.toJSON()), /Checking payments…/);
assert.equal(root.root.findAllByProps({ role: "status" }).length, 0);

// Nothing wrong: one calm line, no rule list, no threshold jargon.
const quiet = samplePaymentHealth();
quiet.status = "ok";
for (const item of quiet.signals) {
  item.count = 0;
  item.firing = false;
}
root = await render(quiet);
let panel = root.root.findByProps({ "data-health-anchor": "payments" });
assert.equal(panel.props.className, "paymentHealth is-calm");
assert.equal(
  text(root.toJSON()),
  "Payments are working6 confirmed payments in 24 h · 75% success over 7 days · checked every 5 minutes, and an email is sent if anything breaks",
);
assert.equal(root.root.findAllByType("li").length, 0, "Healthy rules are not listed");
assert.equal(root.root.findAllByProps({ role: "status" }).length, 0);

// Something firing: only that alert is listed, in plain words, with the numbers below.
const sample = samplePaymentHealth();
root = await render(sample);
panel = root.root.findByProps({ "data-health-anchor": "payments" });
assert.equal(panel.props.className, "paymentHealth is-warning");
assert.match(text(root.toJSON()), /Payments need a look/);
let rows = root.root.findAllByType("li");
assert.equal(
  rows.length,
  1,
  "Only the firing rule is listed; renewals below their threshold are not",
);
assert.equal(rows[0].props.className, "is-warning");
assert.match(text(rows[0]), /The card form failed to load for several customers/);
assert.match(text(rows[0]), /2 in the last 30 min/);
assert.match(text(rows[0]), /Next step: Check Stripe\.js loading/);
assert.match(text(rows[0]), /Warning$/);
assert(!/alert at|threshold/i.test(text(root.toJSON())), "No threshold jargon");
assert.match(text(root.toJSON()), /75%/);
assert.match(text(root.toJSON()), /6 paid of 8 finished checkouts · 1 still open/);

// A critical alert ranks first and reads naturally in Chinese.
const critical = samplePaymentHealth();
critical.status = "critical";
Object.assign(
  critical.signals.find((s) => s.key === "paid_not_fulfilled")!,
  {
    count: 1,
    firing: true,
  },
);
root = await render(critical, "zh");
rows = root.root.findAllByType("li");
assert.equal(rows[0].props.className, "is-critical");
assert.match(text(rows[0]), /已付款但没有发放套餐或额度近 7 天 1 次/);
assert(!text(root.toJSON()).includes("阈值"), "No threshold jargon in Chinese");

// Gaps in the alert path are spelled out, and unmeasured rules say so.
const gaps = samplePaymentHealth();
gaps.alerting.emailConfigured = false;
gaps.alerting.lastEvaluatedAt = null;
gaps.signals.find((s) => s.key === "paid_not_recorded")!.count = null;
root = await render(gaps);
const trust = root.root.findByProps({ role: "status" });
assert.equal(trust.props.className, "paymentHealthTrust");
assert.equal(
  text(trust),
  "Do not rely on silence yet: alert email is not configured · the 5-minute check has not run recently",
);
const unknown = root.root
  .findAllByType("li")
  .find((row: any) => row.props.className === "is-unknown");
assert.match(
  text(unknown),
  /Stripe took payment but the checkout was not recorded.*Could not be measured at the last check/,
);
assert.match(text(unknown), /Unknown$/);

// Payments switched off is the headline, in Chinese too.
const off = samplePaymentHealth();
off.status = "not_configured";
off.billingConfigured = false;
off.alerting.stripeCheck = "not_configured";
root = await render(off, "zh");
assert.match(text(root.toJSON()), /支付未开启：用户现在无法购买/);
assert.match(
  text(root.root.findByProps({ role: "status" })),
  /暂时不能把“没告警”当作“正常”： 支付未开启/,
);

// Unreadable data never shows a trust line.
const unavailable = samplePaymentHealth();
unavailable.status = "unavailable";
unavailable.signals = [];
unavailable.windows = [];
root = await render(unavailable);
assert.match(text(root.toJSON()), /Payment health could not be checked/);
assert.equal(root.root.findAllByProps({ role: "status" }).length, 0);
assert.equal(root.root.findAllByType("li").length, 0);

console.log(
  "PASS: payment panel is one calm line when nothing needs action, lists only firing or unmeasured alerts (critical first) in plain words without thresholds, with next steps and the numbers behind them, names each gap (no email, stale check, payments off), and never claims health while loading or unreadable",
);
