import { expect, test } from "@playwright/test";

test("the hero loop from the Watch bar to resolved", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/portfolio");

  // 1. Open the incident from the Watch bar, then its record
  await page.getByRole("region", { name: "Watch" }).getByRole("button", { name: /Kendall Street Tower/ }).click();
  await page.getByRole("complementary", { name: "Inspector" }).getByRole("link", { name: "Open incident I-2026-0167" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Leak, B2 booster pump room");
  await expect(page.getByText("12 steps, 18 messages: 14 delivered, 4 failed")).toBeVisible();
  await expect(page.getByText("2.28 kL")).toBeVisible();

  const bar = page.getByRole("toolbar", { name: "Actions on I-2026-0167" });

  // 2. Acknowledge as Helen: the button names the action, the confirmation repeats it
  await bar.getByRole("button", { name: "Acknowledge", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Acknowledged. Escalation stopped." })).toBeVisible();
  await expect(page.getByText(/^Acknowledged by Helen Castellano at/)).toBeVisible();

  // 4. Dispatch Tom with an ETA of 25 min
  await bar.getByRole("button", { name: "Dispatch", exact: true }).click();
  await page.getByLabel("ETA in minutes").fill("25");
  await page.locator("form").filter({ has: page.getByLabel("ETA in minutes") }).getByRole("button", { name: "Dispatch", exact: true }).click();
  await expect(page.getByText("Dispatched Tom Fitzgerald, ETA 25 min.")).toBeVisible();

  // run the clock at 60x
  await page.keyboard.press("Shift+D");
  await page.getByRole("region", { name: "Demo tray" }).getByRole("radio", { name: "60x" }).click();
  await page.keyboard.press("Shift+D");

  // 5. Close XV-01: the confirmation says what loses supply
  await bar.getByRole("button", { name: "Close isolation valve" }).click();
  await expect(page.getByText(/Levels 7 to 18 \(12 levels, 84 apartments\)/)).toBeVisible();
  await page.getByRole("button", { name: "Close XV-01" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Closed XV-01." })).toBeVisible();

  // 6. Resolve is refused while WL-B2-03 still reads wet
  await bar.getByRole("button", { name: "Resolve", exact: true }).click();
  await page.getByLabel("Cause (required)").fill("Mechanical seal failure on pump P-02");
  await page.getByLabel("Action taken (required)").fill("Seal replaced by Calloway Plumbing, pump back in service");
  await page.locator("form").getByRole("button", { name: "Resolve", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("WL-B2-03 still reads wet");

  // about 40 simulated minutes later it reads dry
  const closed = page.getByText(/^Resolved by Helen Castellano\. Cause: Mechanical seal failure on pump P-02/);
  await expect(async () => {
    const submit = page.locator("form").getByRole("button", { name: "Resolve", exact: true });
    if (await submit.isVisible()) await submit.click();
    await expect(closed).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 90_000, intervals: [5_000] });

  await expect(page.getByRole("region", { name: "Watch" })).toContainText("No critical incidents.");
});
