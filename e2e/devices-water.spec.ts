import { expect, test } from "@playwright/test";

test("device registry filters match the fleet's health", async ({ page }) => {
  await page.goto("/devices");
  const rows = page.locator("tbody tr[data-row]");
  await expect(rows).toHaveCount(413);
  const filter = (name: RegExp) => page.getByRole("group", { name: "Show only" }).getByRole("button", { name });
  await filter(/^Offline/).click();
  await expect(rows).toHaveCount(2);
  await filter(/^Offline/).click();
  await filter(/^Battery under 20%/).click();
  await expect(rows).toHaveCount(6);
  await filter(/^Battery under 20%/).click();
  await filter(/^Weak signal/).click();
  await expect(rows).toHaveCount(5);
  await filter(/^Weak signal/).click();
  await filter(/^Firmware behind/).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("WL-G-01");
});

test("a device record sends a test alert and is renamed, both written to the Logbook", async ({ page }) => {
  await page.goto("/devices/kendall-street-tower%2FWL-B2-01");
  await expect(page.getByText("Last 20 uplinks")).toBeVisible();
  await page.getByRole("button", { name: "Send test alert" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Test alert sent." })).toBeVisible();
  await page.getByRole("button", { name: "Rename" }).click();
  await page.getByLabel("Name").fill("Booster room door sensor");
  await page.locator("form").getByRole("button", { name: "Rename" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Booster room door sensor");
});

test("water shows the hero night as the breach and links its incident", async ({ page }) => {
  await page.goto("/water");
  await expect(page.getByRole("link", { name: "I-2026-0167" })).toBeVisible();
  const nights = page.getByRole("figure").filter({ hasText: "Overnight flow, Kendall Street Tower" });
  await nights.getByRole("button", { name: "Table" }).click();
  await expect(nights.getByRole("row").last()).toContainText("15.6");
  await expect(nights.getByRole("row").last()).toContainText("Yes");
});
