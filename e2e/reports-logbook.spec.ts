import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("the Logbook filters by building and exports CSV", async ({ page }) => {
  await page.goto("/logbook");
  await expect(page.getByRole("heading", { name: "Logbook" })).toBeVisible();
  await page.getByRole("combobox", { name: "Building" }).selectOption("kendall-street-tower");
  await page.getByRole("combobox", { name: "Type" }).selectOption("notifications");
  await expect(page.getByText(/Escalation step 12, Helen Castellano/)).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Export .* entries as CSV/ }).click()]);
  const csv = readFileSync((await download.path())!, "utf8");
  expect(csv.split("\r\n")[0]).toContain("Time,Building,Actor,Action,Target,Incident,Detail");
  expect(csv).toContain("Kendall Street Tower");
  expect(csv).toMatch(/2026-11-20 0\d:\d\d:\d\d AEDT/);
});

test("the October report reconciles and includes the Foundry burst", async ({ page }) => {
  await page.goto("/reports/monthly?month=2026-10");
  await expect(page.getByRole("heading", { name: "October 2026", exact: true })).toBeVisible();
  await expect(page.getByText(/The slowest response was I-2026-0141 at The Foundry Apartments, acknowledged after 3 h 45 min/)).toBeVisible();
  const rows = page.getByRole("table").last().locator("tbody tr");
  const totalText = await page.locator("tfoot").first().innerText();
  const count = Number(totalText.match(/Total\s+(\d+)/)![1]);
  await expect(rows).toHaveCount(count);
});

test("an incident exports to its report", async ({ page }) => {
  await page.goto("/incidents/I-2026-0141");
  await page.getByRole("link", { name: "Export incident report" }).click();
  await expect(page).toHaveURL(/\/reports\/incident\/I-2026-0141/);
  await expect(page.getByRole("heading", { name: "Burst, Level 5, apartment 506" })).toBeVisible();
  await expect(page.getByText("Apartments 506 and 406: flooring, kitchen joinery and a ceiling. Not priced here.")).toBeVisible();
});
