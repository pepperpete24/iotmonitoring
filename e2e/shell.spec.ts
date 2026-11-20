import { expect, test } from "@playwright/test";

test("Watch bar shows the hero incident with computed durations", async ({ page }) => {
  await page.goto("/portfolio");
  const watch = page.getByRole("region", { name: "Watch" });
  await expect(watch).toContainText("Kendall Street Tower");
  await expect(watch).toContainText("Critical for 3 h 36 min");
  await expect(watch).toContainText("Not acknowledged");
  await expect(watch).toContainText("3 warnings, one not acknowledged");
});

test("selecting a Watch bar line opens the inspector, Esc closes it, reload restores it", async ({ page }) => {
  await page.goto("/portfolio");
  await page.getByRole("button", { name: /Kendall Street Tower/ }).click();
  await expect(page).toHaveURL(/inspect=incident%3AI-2026-0167|inspect=incident:I-2026-0167/);
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await expect(inspector).toContainText("Open for5 h 38 min");
  await page.reload();
  await expect(inspector).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(inspector).toBeHidden();
  await expect(page).not.toHaveURL(/inspect=/);
  await page.goBack();
  await expect(inspector).toBeVisible();
});

test("asset tree works from the keyboard", async ({ page }) => {
  await page.goto("/portfolio");
  const tree = page.getByRole("tree", { name: "Buildings" });
  await tree.getByRole("treeitem", { name: /Pemberton Hall/ }).focus();
  await page.keyboard.press("ArrowDown"); // NSW
  await page.keyboard.press("ArrowDown"); // Ellery House
  await page.keyboard.press("ArrowDown"); // Kendall Street Tower
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/buildings\/kendall-street-tower$/);
  await expect(tree.getByRole("treeitem", { name: /Kendall Street Tower/ })).toHaveAttribute("aria-selected", "true");
  // Collapse NSW: its worst child's glyph moves onto it.
  await tree.getByRole("treeitem", { name: /^NSW/ }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(tree.getByRole("treeitem", { name: /^NSW/ })).toHaveAttribute("aria-expanded", "false");
  await expect(tree.getByRole("treeitem", { name: /^NSW.*Critical/ })).toBeVisible();
});

test("building local time differs from Sydney for Brisbane", async ({ page }) => {
  await page.goto("/buildings/wattle-grove");
  await expect(page.getByRole("banner")).toContainText("07:48 AEDT");
  await expect(page.getByRole("banner")).toContainText("Wattle Grove 06:48 AEST");
});

test("Shift+D opens the demo tray and night theme applies", async ({ page }) => {
  await page.goto("/dev/tokens");
  await page.keyboard.press("Shift+D");
  const tray = page.getByRole("region", { name: "Demo tray" });
  await expect(tray).toBeVisible();
  await tray.getByRole("radio", { name: "Night" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(15, 21, 20)");
});
