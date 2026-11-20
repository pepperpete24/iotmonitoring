import { expect, test } from "@playwright/test";

test("Settings flags Marcus's failing number; fixing it and sending a test delivers", async ({ page }) => {
  await page.goto("/settings/escalation");
  await expect(page.getByText(/Marcus Teo.*SMS failed 4 of the last 4/)).toBeVisible();
  await page.getByLabel("New mobile number").fill("0433 512 418");
  await page.getByRole("button", { name: "Update number" }).click();
  await expect(page.getByText(/mobile updated to 0433 ••• 418/)).toBeVisible();
  await page.getByRole("button", { name: "Send test message" }).click();
  await expect(page.getByText("Test SMS to Marcus Teo delivered.")).toBeVisible();
  await page.goto("/logbook?type=settings");
  await expect(page.getByText("Mobile number for Marcus Teo updated to 0433 ••• 418.")).toBeVisible();
});

test("a rule threshold can be changed and is written to the Logbook", async ({ page }) => {
  await page.goto("/settings/rules");
  await page.getByLabel("Threshold for Low pressure").fill("180");
  const row = page.getByRole("row").filter({ hasText: "Low pressure" });
  await row.getByRole("button", { name: "Save" }).click();
  await expect(row.getByRole("button", { name: "Saved" })).toBeVisible();
  await page.goto("/logbook?type=settings");
  await expect(page.getByText(/Rule "Low pressure" changed from 200, 1 min to 180, 1 min/)).toBeVisible();
});

test("command search jumps to a device by tag", async ({ page }) => {
  await page.goto("/portfolio");
  await page.keyboard.press("Control+K");
  const dialog = page.getByRole("dialog", { name: "Search" });
  await dialog.getByRole("combobox", { name: "Search" }).or(dialog.getByLabel("Search")).first().fill("PC-02");
  await expect(dialog.getByRole("option").filter({ hasText: "Kendall Street Tower" }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/devices\//);
});

test("Day one shows an empty customer with what to have ready", async ({ page }) => {
  await page.goto("/portfolio");
  await page.keyboard.press("Shift+D");
  await page.getByRole("region", { name: "Demo tray" }).getByRole("radio", { name: "Day one, new customer" }).click();
  await expect(page.getByRole("heading", { name: "Add your first building" })).toBeVisible();
  await expect(page.getByText("No buildings yet. Each building appears here once its first device is commissioned.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Watch" })).toContainText("No critical incidents.");
  await page.getByRole("button", { name: "Book a site survey" }).click();
  await expect(page.getByText(/Booked. Our field team will call/)).toBeVisible();
});
