import { test, expect } from "./fixtures";

// More computers than the plan allows is rare in real accounts, so this card was
// never seen in the preview and its buttons shipped without button styling.
test("the paused-computers card has real buttons and the shared checkbox", async ({
  page,
}, info) => {
  const zh = info.project.metadata.language === "zh";
  const dark = info.project.metadata.theme === "dark";
  await page.goto("/dashboard/connect/devices?computers=over");
  const card = page.locator(".computerPlanLimit");
  await expect(card).toBeVisible();
  await expect(card.getByRole("heading", { level: 2 })).toContainText(zh ? "3" : "1 of your 3");

  const looksLikeAButton = async (selector: string) => {
    const style = await card.locator(selector).evaluate((el) => {
      const computed = getComputedStyle(el);
      return {
        radius: parseFloat(computed.borderRadius),
        padding: parseFloat(computed.paddingLeft),
        background: computed.backgroundColor,
      };
    });
    expect(style.radius).toBeGreaterThan(4);
    expect(style.padding).toBeGreaterThan(8);
    if (dark) expect(style.background).toBe("rgb(255, 255, 255)");
  };
  await looksLikeAButton(".computerPlanLimitActions .computerPlanLimitPrimary");

  await card.locator(".computerPlanLimitActions .ghostButton").click();
  const boxes = card.locator("input[type=checkbox]");
  await expect(boxes).toHaveCount(3);
  await expect(boxes.nth(0)).toBeChecked();
  await expect(boxes.nth(2)).not.toBeChecked();
  await expect(boxes.nth(2)).toBeDisabled();
  for (const box of await boxes.all()) await expect(box).toHaveClass(/raCheckbox/);
  expect(await boxes.nth(0).evaluate((el) => getComputedStyle(el).appearance)).toBe("none");
  await looksLikeAButton(".computerPlanLimitChooserActions .computerPlanLimitPrimary");

  // Unchecking one frees a slot for the paused computer.
  await boxes.nth(1).uncheck();
  await expect(boxes.nth(2)).toBeEnabled();
});
