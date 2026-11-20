// Screenshots of key screens at desktop and phone width, in both themes.
// Usage: npm run shots [-- --out screenshots/m1 --widths 1440,390]
// Starts `vite preview` on the built app, so run `npm run build` first.
import { chromium } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const out = args.out ?? "screenshots/latest";
const widths = (args.widths ?? "1440,390").split(",").map(Number);
const heights = { 1920: 1080, 1440: 900, 1024: 768, 768: 1024, 390: 844 };
const PORT = 4179;

const SCREENS = [
  { name: "portfolio", path: "/portfolio" },
  { name: "portfolio-all", path: "/portfolio?view=all", full: true },
  { name: "portfolio-map", path: "/portfolio?show=map" },
  { name: "building-kendall", path: "/buildings/kendall-street-tower", full: true },
  { name: "building-kendall-device", path: "/buildings/kendall-street-tower?inspect=device:kendall-street-tower%2FWL-B2-03" },
  { name: "building-kendall-charts", path: "/buildings/kendall-street-tower?tab=charts", full: true },
  { name: "building-palmcrest-health", path: "/buildings/palmcrest-apartments?layer=health", full: true },
  { name: "building-parkside", path: "/buildings/parkside-secondary", full: true },
  { name: "incidents", path: "/incidents" },
  { name: "incident-hero", path: "/incidents/I-2026-0167", full: true },
  { name: "incident-foundry", path: "/incidents/I-2026-0141", full: true },
  { name: "devices", path: "/devices" },
  { name: "device-pc02", path: "/devices/kendall-street-tower%2FPC-02", full: true },
  { name: "water", path: "/water", full: true },
  { name: "water-foundry", path: "/water?building=the-foundry", full: true },
  { name: "logbook", path: "/logbook" },
  { name: "report-october", path: "/reports/monthly?month=2026-10", full: true },
  { name: "report-incident-foundry", path: "/reports/incident/I-2026-0141", full: true },
  { name: "shell-incident-inspector", path: "/portfolio?inspect=incident:I-2026-0167" },
  { name: "dev-symbols", path: "/dev/symbols?inspect=symbol:isolation-valve", full: true },
  { name: "tree-drawer", path: "/buildings/wattle-grove", widthOnly: [1024], click: "Show buildings", byLabel: true },
];

mkdirSync(out, { recursive: true });
const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { shell: true, stdio: "pipe" });
await new Promise((resolve, reject) => {
  server.stdout.on("data", (d) => String(d).includes(String(PORT)) && resolve());
  server.on("exit", (code) =>
    reject(new Error(`vite preview exited (${code}). Is port ${PORT} already in use, or is dist/ missing? Run npm run build.`)),
  );
  setTimeout(resolve, 8000);
});

const browser = await chromium.launch();
try {
  for (const theme of ["light", "dark"]) {
    for (const width of [...new Set([...widths, 1024])]) {
      const ctx = await browser.newContext({ viewport: { width, height: heights[width] ?? 900 }, reducedMotion: "reduce" });
      await ctx.addInitScript((t) => localStorage.setItem("tidemark.ui", JSON.stringify({ theme: t, density: "compact" })), theme);
      const page = await ctx.newPage();
      for (const s of SCREENS) {
        if (s.widthOnly && !s.widthOnly.includes(width)) continue;
        if (!s.widthOnly && !widths.includes(width)) continue;
        await page.goto(`http://localhost:${PORT}${s.path}`);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(400);
        if (s.click) {
          const target = s.byLabel ? page.getByLabel(s.click) : page.getByText(s.click, { exact: true });
          if (await target.first().isVisible().catch(() => false)) await target.first().click();
          await page.waitForTimeout(150);
        }
        const file = path.join(out, `${s.name}-${width}-${theme}.png`);
        if (s.full) {
          // The shell scrolls inside the canvas, so grow the viewport to the canvas content.
          const h = await page.evaluate(() => {
            const c = document.querySelector("main");
            return c ? c.scrollHeight + c.getBoundingClientRect().top : document.body.scrollHeight;
          });
          await page.setViewportSize({ width, height: Math.min(Math.max(h, heights[width] ?? 900), 6000) });
          await page.waitForTimeout(100);
        }
        await page.screenshot({ path: file });
        if (s.full) await page.setViewportSize({ width, height: heights[width] ?? 900 });
        console.log(file);
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  // Kill the whole tree (shell, npx, vite) before the parent handle goes away.
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/f", "/t"], { shell: true });
  else server.kill();
  process.exit(0);
}
