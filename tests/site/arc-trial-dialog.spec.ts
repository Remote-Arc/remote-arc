import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

// Counts the access checks and message sends the chat makes after load. The local
// preview answers /api/* inside the page, so this wraps the page's fetch.
async function countRequests(page: Page) {
  await page.evaluate(() => {
    const native = window.fetch;
    const counts = { status: 0, messages: 0 };
    (window as any).__arcCounts = counts;
    window.fetch = (input, init) => {
      const path = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        location.origin,
      ).pathname;
      if (path === "/api/arc/status") counts.status++;
      if (path.endsWith("/messages") && init?.method === "POST") counts.messages++;
      return native(input, init);
    };
  });
}
const counts = (page: Page) =>
  page.evaluate(() => (window as any).__arcCounts as { status: number; messages: number });
const dialog = (page: Page, name: RegExp) => page.getByRole("dialog", { name });

test("Without Arc access, Send checks access and offers the Pro trial, keeping the draft", async ({
  page,
}) => {
  await page.goto("/dashboard/agent/chat?arcaccess=pro-trial");
  const input = page.locator("#arc-chat-input");
  await input.fill("Summarise my open pull requests.");
  await countRequests(page);
  // Send is not silently disabled for an account without access.
  await expect(page.locator(".arcChatSend")).toBeEnabled();
  await page.locator(".arcChatSend").click();

  const offer = dialog(page, /Start your free Pro trial to send this|开启 Pro 免费试用即可发送/);
  await expect(offer).toBeVisible();
  await expect(offer).toContainText(/payment method is required|需要绑定付款方式/);
  await expect(
    offer.getByRole("link", { name: /^(Start free trial|开启免费试用)/ }),
  ).toHaveAttribute("href", /^\/checkout/);
  await expect(offer.getByRole("link", { name: /^(View plans|查看套餐)$/ })).toHaveAttribute(
    "href",
    "/checkout",
  );
  // Access was read again before the offer, and nothing was sent.
  expect(await counts(page)).toEqual({ status: 1, messages: 0 });

  await page.keyboard.press("Escape");
  await expect(offer).toHaveCount(0);
  await expect(input).toHaveValue("Summarise my open pull requests.");
});

test("With the Arc trial on offer, starting it from the dialog sends the draft", async ({
  page,
}) => {
  await page.goto("/dashboard/agent/chat?arcaccess=arc-trial");
  const input = page.locator("#arc-chat-input");
  await input.fill("List my remote computers.");
  await countRequests(page);
  await page.locator(".arcChatSend").click();

  const offer = dialog(page, /Start your free Arc trial to send this|开启 Arc 免费试用即可发送/);
  await expect(offer).toBeVisible();
  expect((await counts(page)).messages).toBe(0);
  await offer.getByRole("button", { name: /^(Start free trial|开启免费试用)$/ }).click();

  await expect(offer).toHaveCount(0);
  await expect.poll(async () => (await counts(page)).messages).toBe(1);
  await expect(page.locator(".arcChatMessage.user")).toContainText("List my remote computers.");
  await expect(input).toHaveValue("");
});

test("After the trial has ended, Send explains it and links to plans", async ({ page }) => {
  await page.goto("/dashboard/agent/chat?arcaccess=ended");
  const input = page.locator("#arc-chat-input");
  await input.fill("Check the server room.");
  await countRequests(page);
  await page.locator(".arcChatSend").click();

  const offer = dialog(page, /^(Your trial has ended|试用已结束)$/);
  await expect(offer).toBeVisible();
  await expect(offer.getByRole("link", { name: /^(View plans|查看套餐)/ })).toHaveAttribute(
    "href",
    "/checkout",
  );
  await offer.getByRole("button", { name: /^(Not now|暂不)$/ }).click();
  await expect(offer).toHaveCount(0);
  await expect(input).toHaveValue("Check the server room.");
  expect((await counts(page)).messages).toBe(0);
});
