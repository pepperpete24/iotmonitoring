// Accessibility audit: axe on every key screen in light and night, at desktop
// and phone width. Fails on any serious or critical violation.
// Usage: node scripts/axe.mjs [--json out.json]   (run `npm run build` first)
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const PAGES = [
  "/portfolio",
  "/portfolio?view=all",
  "/buildings/kendall-street-tower",
  "/buildings/kendall-street-tower?inspect=device:kendall-street-tower%2FWL-B2-03",
  "/incidents",
  "/incidents/I-2026-0167",
  "/devices",
  "/devices/kendall-street-tower%2FPC-02",
  "/water",
  "/logbook",
  "/reports/monthly?month=2026-10",
  "/settings/escalation",
  "/settings/rules",
  "/settings/plan",
  "/m/respond/I-2026-0167",
  "/m/commission",
];
const port = 4181;
const server = spawn("npx", ["vite", "preview", "--port", String(port), "--strictPort"], { shell: true, stdio: "ignore" });
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 250));
  if (await fetch(`http://localhost:${port}/`).then(() => true, () => false)) break;
}
const results = [];
const browser = await chromium.launch();
try {
  for (const theme of ["light", "dark"]) {
    for (const width of [1440, 390]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
      await ctx.addInitScript((t) => localStorage.setItem("tidemark.ui", JSON.stringify({ theme: t, density: "compact" })), theme);
      const page = await ctx.newPage();
      for (const path of PAGES) {
        await page.goto(`http://localhost:${port}${path}`);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(700);
        const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        // horizontal overflow check at the same time
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        results.push({ theme, width, path, violations: bad.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, sample: v.nodes[0]?.target?.join(" ") })), overflow });
        const flag = bad.length ? `${bad.length} serious/critical` : "clean";
        console.log(`${theme.padEnd(5)} ${String(width).padEnd(4)} ${path.padEnd(70)} ${flag}${overflow > 1 ? `, horizontal overflow ${overflow}px` : ""}`);
        for (const v of bad) console.log(`        ${v.impact}: ${v.id}, ${v.help} (${v.nodes.length}), e.g. ${v.nodes[0]?.target?.join(" ")}`);
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/f", "/t"], { shell: true });
  else server.kill();
}
const i = process.argv.indexOf("--json");
if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify(results, null, 2));
const failed = results.filter((r) => r.violations.length || r.overflow > 1);
console.log(failed.length ? `\n${failed.length} page checks need fixing.` : "\nNo serious or critical issues, and no horizontal overflow.");
process.exit(failed.length ? 1 : 0);
