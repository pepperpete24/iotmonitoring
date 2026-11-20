import { expect, test } from "@playwright/test";

test("portfolio opens on the computed briefing", async ({ page }) => {
  await page.goto("/portfolio");
  await expect(page.locator("p.t-briefing")).toHaveText(
    "One critical incident, not yet acknowledged: Kendall Street Tower, critical for 3 h 36 min. 3 warnings. 2 devices offline. 4 devices muted.",
  );
  await expect(page.getByText(/Water used in the last 24 hours: [\d,]+ kL/)).toBeVisible();
});

test("the ledger puts the critical building first and expands to the top issue", async ({ page }) => {
  await page.goto("/portfolio");
  const rows = page.locator("tbody tr[data-row]");
  await expect(rows.first()).toContainText("Kendall Street Tower");
  await rows.first().click();
  await expect(page.getByRole("link", { name: "Open incident I-2026-0167" })).toBeVisible();
  await expect(page.getByText("Leak, B2 booster pump room.")).toBeVisible();
});

test("all 16 buildings and the map view", async ({ page }) => {
  await page.goto("/portfolio?view=all");
  await expect(page.locator("tbody tr[data-row]")).toHaveCount(16);
  await page.getByRole("radio", { name: "Map" }).click();
  await expect(page.getByRole("button", { name: /Kendall Street Tower, Surry Hills NSW, critical/ })).toBeVisible();
});

test("the riser diagram is keyboard navigable and opens devices in the inspector", async ({ page }) => {
  await page.goto("/buildings/kendall-street-tower");
  const first = page.locator("[data-device][tabindex='0']").first();
  await first.focus();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/inspect=device/);
  await expect(page.getByRole("complementary", { name: "Inspector" })).toContainText("Device health");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "Inspector" })).toBeHidden();
});

test("the wet sensor carries the critical glyph and its name says so", async ({ page }) => {
  await page.goto("/buildings/kendall-street-tower");
  const sensor = page.getByRole("button", { name: "WL-B2-03", exact: true });
  await expect(sensor).toBeVisible();
  await expect(sensor).toHaveAccessibleDescription("leak sensor, B2 booster pump room floor, Wet, critical");
});

test("layer and tab are kept in the URL", async ({ page }) => {
  await page.goto("/buildings/kendall-street-tower");
  await page.getByRole("radio", { name: "Pressure" }).click();
  await page.getByRole("tab", { name: "Devices" }).click();
  await expect(page).toHaveURL(/layer=pressure/);
  await expect(page).toHaveURL(/tab=devices/);
  await page.reload();
  await expect(page.getByRole("radio", { name: "Pressure" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("tab", { name: "Devices" })).toHaveAttribute("data-state", "active");
});

test("every building opens into a working riser diagram", async ({ page }) => {
  await page.goto("/portfolio?view=all");
  await expect(page.locator("tbody tr[data-row]")).toHaveCount(16);
  const links = await page.locator("tbody a[href^='/buildings/']").evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
  expect(links).toHaveLength(16);
  for (const href of links) {
    await page.goto(href);
    await expect(page.locator("[data-device]").first()).toBeVisible();
  }
});
