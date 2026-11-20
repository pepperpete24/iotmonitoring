import { expect, test, type Locator, type Page } from "@playwright/test";

/** Move keyboard focus to a control with Tab, from wherever focus is now (no mouse). */
async function tabTo(page: Page, target: Locator, max = 80) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error("Could not reach the control with Tab");
}

test("the hero loop by keyboard alone", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto("/portfolio");
  await expect(page.getByRole("region", { name: "Watch" })).toContainText("Critical for 3 h 36 min");

  // the Watch bar line is reachable with Tab and opens the incident in the inspector
  const line = page.getByRole("region", { name: "Watch" }).getByRole("button", { name: /Kendall Street Tower/ });
  await tabTo(page, line);
  await page.keyboard.press("Enter");
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await expect(inspector).toBeVisible();
  await tabTo(page, inspector.getByRole("link", { name: "Open incident I-2026-0167" }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Leak, B2 booster pump room");

  const bar = page.getByRole("toolbar", { name: "Actions on I-2026-0167" });
  await tabTo(page, bar.getByRole("button", { name: "Acknowledge", exact: true }));
  await page.keyboard.press("Enter");
  await expect(page.getByText(/^Acknowledged by Helen Castellano at/)).toBeVisible();

  // dispatch Tom, ETA 25
  await tabTo(page, bar.getByRole("button", { name: "Dispatch", exact: true }));
  await page.keyboard.press("Enter");
  await tabTo(page, page.getByLabel("ETA in minutes"));
  await page.keyboard.press("Control+A");
  await page.keyboard.type("25");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Dispatched Tom Fitzgerald, ETA 25 min.")).toBeVisible();

  // close XV-01: two steps, both by keyboard
  await tabTo(page, bar.getByRole("button", { name: "Close isolation valve" }));
  await page.keyboard.press("Enter");
  await tabTo(page, page.getByRole("button", { name: "Close XV-01" }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Closed XV-01." })).toBeVisible();

  // 60x from the demo tray, by keyboard
  await page.keyboard.press("Shift+D");
  const tray = page.getByRole("region", { name: "Demo tray" });
  await tabTo(page, tray.getByRole("radio", { name: "1x" }));
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(tray.getByRole("radio", { name: "60x" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Shift+D");

  // resolve once the floor reads dry
  await tabTo(page, bar.getByRole("button", { name: "Resolve", exact: true }));
  await page.keyboard.press("Enter");
  await tabTo(page, page.getByLabel("Cause (required)"));
  await page.keyboard.type("Mechanical seal failure on pump P-02");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Seal replaced by Calloway Plumbing");
  const closed = page.getByText(/^Resolved by Helen Castellano\. Cause: Mechanical seal failure on pump P-02/);
  await expect(async () => {
    const submit = page.locator("form").getByRole("button", { name: "Resolve", exact: true });
    if (await submit.isVisible()) {
      await submit.focus();
      await page.keyboard.press("Enter");
    }
    await expect(closed).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 100_000, intervals: [5_000] });
});
