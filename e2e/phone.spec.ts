import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test("Tom opens the SMS link and acknowledges in a couple of taps", async ({ page }) => {
  await page.goto("/r/0167");
  await expect(page).toHaveURL(/\/m\/respond\/I-2026-0167/);
  await expect(page.getByRole("heading", { name: "Kendall Street Tower" })).toBeVisible();
  await expect(page.getByText("Car park entry off Kendall Lane")).toBeVisible();
  await page.getByRole("button", { name: "Acknowledge" }).click();
  await expect(page.getByText(/Acknowledged by Tom Fitzgerald/)).toBeVisible();
  await page.getByRole("button", { name: "I am on my way" }).click();
  await expect(page.getByText("On the way: Tom Fitzgerald")).toBeVisible();
});

test("the demo tray shows the SMS that brought Tom here", async ({ page }) => {
  await page.goto("/m/respond/I-2026-0167");
  await page.keyboard.press("Shift+D");
  const tray = page.getByRole("region", { name: "Demo tray" });
  await expect(tray.getByText(/Critical, Kendall Street Tower: .*I-2026-0167. Acknowledge: tidemark.example\/r\/0167/)).toBeVisible();
});

test("Kayla commissions a leak sensor in under two minutes and it appears in the riser", async ({ page }) => {
  const started = Date.now();
  await page.goto("/m/commission");
  await page.getByRole("button", { name: "Use the code on the demo label" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Yes, that is it" }).click();
  await page.getByLabel("Exact location").fill("Booster pump room, under P-02 drip tray");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByLabel("Tag")).toHaveValue("WL-B2-05");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Good signal.")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "I pressed it" }).click();
  await expect(page.getByText(/Test uplink received at/)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Caption").fill("Sensor on the floor beside the pump plinth");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Commission WL-B2-05" }).click();
  await expect(page.getByRole("heading", { name: "Commissioned" })).toBeVisible();
  expect(Date.now() - started).toBeLessThan(120_000);
  await page.getByRole("link", { name: /See it in Kendall Street Tower/ }).click();
  await expect(page.getByRole("button", { name: /WL-B2-05, leak sensor/ }).first()).toBeVisible();
});
