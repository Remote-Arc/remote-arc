import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

const submissionId = "11111111-2222-4333-8444-555555555555";
const threadId = "aaaaaaaa-bbbb-8ccc-addd-eeeeeeeeeeee";
const message = "I paid for a plan upgrade but my plan status has not changed.";

async function mount(page: Page, threadStatus = 200) {
  const opened: string[] = [];
  await page.route(/\/api\/admin\/submissions(?:\?|$)/, (route) =>
    route.fulfill({
      json: {
        page: 0,
        pageSize: 40,
        total: 1,
        counts: [{ category: "feedback", count: 1 }],
        items: [
          {
            id: submissionId,
            category: "feedback",
            email: "customer@example.test",
            name: "Jordan",
            message,
            source: "support",
            status: "new",
            consent_at: "2026-11-13T17:19:28.000Z",
            created_at: "2026-11-13T17:19:28.000Z",
            updated_at: "2026-11-13T17:19:28.000Z",
          },
        ],
      },
    }),
  );
  await page.route(/\/api\/admin\/submissions\/[^/]+\/support-thread$/, (route) => {
    opened.push(route.request().method() + " " + new URL(route.request().url()).pathname);
    return threadStatus === 200
      ? route.fulfill({ json: { threadId } })
      : route.fulfill({ status: threadStatus, json: { error: "NOT_FOUND" } });
  });
  const thread = {
    id: threadId,
    sender_email: "customer@example.test",
    subject: "Your Remote Arc support request",
    status: "open",
    last_message_at: "2026-11-13T17:19:28.000Z",
    source: "email",
    beta_status: null,
    last_direction: "inbound",
    last_delivery_status: "received",
  };
  await page.route(/\/api\/admin\/support-inbox(?:\?|$)/, (route) =>
    route.fulfill({ json: { items: [thread] } }),
  );
  await page.route(new RegExp("/api/admin/support-inbox/" + threadId + "$"), (route) =>
    route.fulfill({
      json: {
        thread,
        messages: [
          {
            id: "m1",
            direction: "inbound",
            source: "email",
            from: "customer@example.test",
            to: "support@remotearc.app",
            subject: thread.subject,
            body: "Submitted through the Remote Arc website form.\nName: Jordan\n\n" + message,
            deliveryStatus: "received",
            createdAt: thread.last_message_at,
          },
        ],
      },
    }),
  );
  await page.addInitScript(() => {
    (window as Window & { metricsTestFetch?: typeof fetch }).metricsTestFetch =
      window.fetch.bind(window);
  });
  await page.goto("/admin-preview?section=leads");
  await expect(page.locator(".adminShell")).toBeVisible();
  await page.addScriptTag({ type: "module", url: "/scripts/admin-console-browser-fixture.tsx" });
  const panel = page.locator("#admin-console-fixture");
  await expect(panel.locator(".adminLeadItem")).toHaveCount(1);
  return { panel, opened };
}

test("a submission opens its support conversation, ready to answer from support@", async ({
  page,
}) => {
  const { panel, opened } = await mount(page);
  await panel.locator(".adminLeadButtons button").first().click();
  await expect(panel.locator(".adminSupportConversation")).toContainText(message);
  await expect(panel.locator(".adminSupportConversation")).toContainText("customer@example.test");
  expect(opened).toEqual(["POST /api/admin/submissions/" + submissionId + "/support-thread"]);
  expect(new URL(page.url()).searchParams.get("section")).toBe("support");
});

test("a submission that cannot be opened stays on the list with an alert", async ({ page }) => {
  const { panel, opened } = await mount(page, 404);
  await panel.locator(".adminLeadButtons button").first().click();
  await expect(panel.locator(".adminAlert")).toBeVisible();
  await expect(panel.locator(".adminLeadItem")).toHaveCount(1);
  expect(opened).toHaveLength(1);
});
