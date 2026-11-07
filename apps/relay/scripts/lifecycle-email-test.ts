import assert from "node:assert/strict";
import {
  queuePlanStartedEmail,
  queueTrialEndingEmails,
  runLifecycleEmails,
} from "../src/platform/lifecycle-email.js";
import { createWorkerFixture } from "./worker-fixture.js";

const fixture = createWorkerFixture(),
  { sql } = fixture;
const env = {
  ...fixture.env,
  ARC_PLATFORM_ENABLED: "1",
  SENDPULSE_API_KEY: "sendpulse-fixture-key",
  LIFECYCLE_EMAILS_ENABLED: "1",
} as never;
const rows = (userId: string) =>
  sql
    .prepare(
      "SELECT kind,ref,status,error_code,provider FROM lifecycle_emails WHERE user_id=? ORDER BY kind",
    )
    .all(userId) as { kind: string; ref: string; status: string; error_code: string | null }[];
const status = (userId: string, kind: string) =>
  rows(userId).find((row) => row.kind === kind)?.status;

const sent: { url: string; auth: string | null; body: any }[] = [];
let reply = (): Response => Response.json({ result: true, id: "sp-" + sent.length });
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url !== "https://api.sendpulse.com/smtp/emails") throw Error("unexpected fetch " + url);
  sent.push({
    url,
    auth: new Headers(init?.headers).get("authorization"),
    body: JSON.parse(String(init?.body)),
  });
  return reply();
}) as typeof fetch;
const html = (index: number) =>
  Buffer.from(sent[index]!.body.email.html, "base64").toString("utf8");

try {
  // 1. Sign-up queues one welcome email; nothing is sent while the flag is off.
  fixture.addUser("new-user");
  assert.deepEqual(
    rows("new-user").map((row) => [row.kind, row.status]),
    [["welcome", "queued"]],
  );
  await runLifecycleEmails({ ...(env as object), LIFECYCLE_EMAILS_ENABLED: undefined } as never);
  assert.equal(sent.length, 0, "delivery is opt-in");
  assert.equal(status("new-user", "welcome"), "queued");

  // 2. With the flag on, SendPulse receives one escaped email with an unsubscribe link,
  // entirely in the account's language: English when unknown, Chinese for zh.
  sql.prepare("UPDATE users SET name=? WHERE id=?").run("<script>x</script>", "new-user");
  assert.deepEqual(await runLifecycleEmails(env), { sent: 1 });
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.auth, "Bearer sendpulse-fixture-key");
  assert.deepEqual(sent[0]!.body.email.to, [{ email: "new-user@example.test" }]);
  assert.equal(sent[0]!.body.email.subject, "Welcome to Remote Arc");
  assert.match(html(0), /<html lang="en"/);
  assert.match(html(0), /10,000 Connect calls/);
  assert.match(html(0), /email\/follow-up\/unsubscribe\?token=/);
  assert(!html(0).includes("<script>"));
  const han = /[一-鿿]/;
  assert(!han.test(html(0)) && !han.test(sent[0]!.body.email.text), "English email has no Chinese");
  assert.equal(status("new-user", "welcome"), "sent");
  await runLifecycleEmails(env);
  assert.equal(sent.length, 1, "a sent email is never sent again");
  fixture.addUser("zh-user");
  sql.prepare("UPDATE users SET locale='zh' WHERE id=?").run("zh-user");
  await runLifecycleEmails(env);
  assert.equal(sent[1]!.body.email.subject, "欢迎使用 Remote Arc");
  assert.match(html(1), /<html lang="zh-CN"/);
  assert.match(html(1), /每月包含 10,000 次 Connect 调用/);
  for (const english of ["Remote Arc lets", "Connect your AI", "Unsubscribe", "Privacy", "Welcome"])
    assert(!html(1).includes(english) && !sent[1]!.body.email.text.includes(english), english);

  // 3. Opted-out people do not get product email; stale rows are dropped.
  fixture.addUser("opted-out");
  sql
    .prepare(
      "INSERT INTO user_followup_contacts(user_id,unsubscribe_token,suppressed_at,updated_at) VALUES(?,?,?,?)",
    )
    .run("opted-out", "token-opted-out", fixture.now, fixture.now);
  fixture.addUser("old-signup");
  sql
    .prepare("UPDATE lifecycle_emails SET created_at=? WHERE user_id=?")
    .run(new Date(Date.now() - 4 * 86_400_000).toISOString(), "old-signup");
  await runLifecycleEmails(env);
  assert.equal(sent.length, 2, "neither opted-out nor stale email is sent");
  assert.deepEqual(
    [rows("opted-out")[0]!.status, rows("opted-out")[0]!.error_code],
    ["skipped", "suppressed"],
  );
  assert.equal(rows("old-signup")[0]!.error_code, "stale");

  // 4. A reverse trial queues its start email and, a day before it ends, a reminder once.
  fixture.addUser("trial-user");
  sql.prepare("UPDATE lifecycle_emails SET status='sent' WHERE user_id=?").run("trial-user");
  const endsAt = new Date(Date.now() + 12 * 3_600_000).toISOString();
  sql
    .prepare(
      "INSERT INTO connect_unlimited_trials(user_id,started_at,ends_at,month_key,base_limit) VALUES(?,?,?,?,10000)",
    )
    .run("trial-user", fixture.now, endsAt, fixture.now.slice(0, 7));
  assert.equal(status("trial-user", "connect_trial_started"), "queued");
  await queueTrialEndingEmails(fixture.db);
  await queueTrialEndingEmails(fixture.db);
  assert.equal(
    rows("trial-user").filter((row) => row.kind === "connect_trial_ending").length,
    1,
    "the reminder is queued once",
  );
  await runLifecycleEmails(env);
  const subjects = sent.slice(2).map((mail) => mail.body.email.subject as string);
  assert(
    subjects.some((subject) =>
      subject.startsWith("Your 7-day unlimited Connect trial has started"),
    ),
  );
  assert(subjects.some((subject) => subject.startsWith("Your full-speed trial ends soon")));
  const trialHtml = html(sent.length - 1) + html(sent.length - 2);
  assert.match(trialHtml, /checkout\?product=connect-unlimited-v1/);
  assert.match(trialHtml, /Slow lane, 2 calls a minute/);

  // 5. A trial email is skipped once the person has paid.
  fixture.addUser("paid-user");
  sql.prepare("UPDATE lifecycle_emails SET status='sent' WHERE user_id=?").run("paid-user");
  sql
    .prepare(
      "INSERT INTO billing_plan_assignments(id,plan_id,subject_type,subject_id,expires_at,created_at,commercial_version_id) VALUES(?,?,?,?,?,?,?)",
    )
    .run(
      "assignment-paid",
      "connect-unlimited-v1",
      "user",
      "paid-user",
      new Date(Date.now() + 30 * 86_400_000).toISOString(),
      fixture.now,
      "seed:live:connect-unlimited-v1",
    );
  sql
    .prepare(
      "INSERT INTO connect_unlimited_trials(user_id,started_at,ends_at,month_key,base_limit) VALUES(?,?,?,?,10000)",
    )
    .run("paid-user", fixture.now, endsAt, fixture.now.slice(0, 7));
  const beforePaid = sent.length;
  await runLifecycleEmails(env);
  assert.equal(sent.length, beforePaid);
  assert.equal(
    rows("paid-user").find((row) => row.kind === "connect_trial_started")!.error_code,
    "already_paid",
  );

  // 6. Plan confirmations: a new plan is confirmed, a renewal of the same plan is not.
  const receipt = (id: string, product: string, start: string, end: string) =>
    sql
      .prepare(
        "INSERT INTO arc_payment_receipts(id,provider,event_id,user_id,product_id,state,amount_cents,currency,period_start,period_end,verified_at,payload_hash) VALUES(?,'stripe',?,?,?,'paid',1900,'usd',?,?,?,?)",
      )
      .run(id, "evt-" + id, "paid-user", product, start, end, fixture.now, "hash");
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString();
  receipt("receipt-1", "connect-unlimited-v1", day(0), day(30));
  const plan = {
    userId: "paid-user",
    sku: "connect-unlimited-v1",
    label: "Connect Unlimited",
    cents: 1900,
  };
  await queuePlanStartedEmail(fixture.db, {
    ...plan,
    receipt: "receipt-1",
    start: day(0),
    end: day(30),
  });
  receipt("receipt-2", "connect-unlimited-v1", day(30), day(60));
  await queuePlanStartedEmail(fixture.db, {
    ...plan,
    receipt: "receipt-2",
    start: day(30),
    end: day(60),
  });
  assert.deepEqual(
    rows("paid-user")
      .filter((row) => row.kind === "plan_started")
      .map((row) => row.ref),
    ["receipt-1"],
    "renewals are not confirmed again",
  );
  receipt("receipt-3", "arc-plus-v1", day(30), day(60));
  await queuePlanStartedEmail(fixture.db, {
    ...plan,
    sku: "arc-plus-v1",
    label: "Plus",
    cents: 3900,
    receipt: "receipt-3",
    start: day(30),
    end: day(60),
  });
  // Confirmations are transactional: they ignore the product-email opt-out.
  sql
    .prepare(
      "INSERT INTO user_followup_contacts(user_id,unsubscribe_token,suppressed_at,updated_at) VALUES(?,?,?,?)",
    )
    .run("paid-user", "token-paid", fixture.now, fixture.now);
  const beforePlans = sent.length;
  await runLifecycleEmails(env);
  const planMails = sent.slice(beforePlans).map((mail) => mail.body.email.subject as string);
  assert.deepEqual(planMails.sort(), [
    "Your Connect Unlimited plan is active",
    "Your Plus plan is active",
  ]);
  assert(
    !html(sent.length - 1).includes("unsubscribe?token="),
    "confirmations have no opt-out link",
  );
  // A yearly plan with Credits is confirmed with its yearly price and its Credits.
  fixture.addUser("annual-user");
  sql
    .prepare(
      "INSERT INTO arc_payment_receipts(id,provider,event_id,user_id,product_id,state,amount_cents,currency,period_start,period_end,verified_at,payload_hash) VALUES(?,'stripe',?,?,?,'paid',24900,'usd',?,?,?,?)",
    )
    .run(
      "receipt-y",
      "evt-y",
      "annual-user",
      "connect-unlimited-v1",
      day(0),
      day(365),
      fixture.now,
      "hash",
    );
  await queuePlanStartedEmail(fixture.db, {
    userId: "annual-user",
    sku: "connect-unlimited-v1",
    label: "Pro",
    cents: 24900,
    receipt: "receipt-y",
    start: day(0),
    end: day(365),
    interval: "year",
    credits: 1000,
  });
  const beforeAnnual = sent.length;
  await runLifecycleEmails(env);
  const annualIndex = sent.findIndex(
    (mail, index) => index >= beforeAnnual && mail.body.email.subject === "Your Pro plan is active",
  );
  assert(annualIndex >= 0, "The yearly plan is confirmed");
  const annualHtml = html(annualIndex);
  assert.match(annualHtml, /US\$249\/year/);
  assert.doesNotMatch(annualHtml, /US\$249\/month/);
  assert.match(annualHtml, /1,000 Arc Credits are ready for each month/);
  assert.match(html(beforeAnnual - 1), /US\$\d+\/month/, "Monthly plans still say per month");

  // 7. A provider rejection is recorded; a timeout is uncertain and never retried.
  fixture.addUser("rejected");
  reply = () => Response.json({ result: false });
  await runLifecycleEmails(env);
  assert.deepEqual(
    [rows("rejected")[0]!.status, rows("rejected")[0]!.error_code],
    ["failed", "provider_rejected"],
  );
  fixture.addUser("timeout");
  reply = () => {
    throw new DOMException("timed out", "TimeoutError");
  };
  await runLifecycleEmails(env);
  assert.equal(status("timeout", "welcome"), "unknown");
  const afterTimeout = sent.length;
  reply = () => Response.json({ result: true, id: "late" });
  await runLifecycleEmails(env);
  assert.equal(sent.length, afterTimeout, "an uncertain delivery is not retried");

  // 8. Lifecycle email stays inside the shared SendPulse capacity and leaves OTP its reserve.
  for (let i = 0; i < 40; i++)
    sql
      .prepare(
        "INSERT INTO lifecycle_emails(id,user_id,kind,ref,status,provider,created_at,attempted_at) VALUES(?,?,?,?,'sent','sendpulse',?,?)",
      )
      .run(
        "filler-" + i,
        "new-user",
        "welcome",
        "filler-" + i,
        fixture.now,
        new Date().toISOString(),
      );
  fixture.addUser("over-capacity");
  const beforeCapacity = sent.length;
  await runLifecycleEmails(env);
  assert.equal(sent.length, beforeCapacity, "the hourly SendPulse share is full");
  assert.equal(status("over-capacity", "welcome"), "queued", "it waits for capacity");

  // 9. Deleting an account removes its queued email.
  sql.prepare("DELETE FROM users WHERE id=?").run("over-capacity");
  assert.equal(rows("over-capacity").length, 0);
} finally {
  globalThis.fetch = originalFetch;
}
sql.close();
console.log(
  "PASS: lifecycle emails queue once per sign-up, trial start, trial ending and new paid plan, deliver through SendPulse only when enabled, confirm yearly plans with their yearly price and Credits, skip opted-out, stale and already-paid cases, never resend uncertain deliveries and respect shared capacity with the OTP reserve",
);
