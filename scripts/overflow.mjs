// Content clipped sideways: any table or block wider than the canvas at tablet widths.
import { chromium } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
const port = 4182;
const server = spawn("npx", ["vite", "preview", "--port", String(port), "--strictPort"], { shell: true, stdio: "ignore" });
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 250));
  if (await fetch(`http://localhost:${port}/`).then(() => true, () => false)) break;
}
const pages = ["/portfolio", "/portfolio?view=all", "/incidents", "/devices", "/water", "/logbook", "/settings/escalation", "/settings/rules", "/settings/plan", "/incidents/I-2026-0167", "/buildings/kendall-street-tower?tab=devices"];
const browser = await chromium.launch();
let bad = 0;
for (const width of [1920, 1440, 1024, 768, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  for (const p of pages) {
    await page.goto(`http://localhost:${port}${p}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    const over = await page.evaluate(() => {
      const main = document.querySelector("main");
      if (!main) return 0;
      return main.scrollWidth - main.clientWidth;
    });
    if (over > 1) {
      bad++;
      console.log(`${width} ${p}: content ${over}px wider than the canvas`);
    }
  }
  await page.close();
}
await browser.close();
if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/f", "/t"], { shell: true });
else server.kill();
console.log(bad ? `${bad} pages clip sideways.` : "No page is wider than its canvas at 1920, 1440, 1024, 768 or 390 px.");
process.exit(bad ? 1 : 0);
