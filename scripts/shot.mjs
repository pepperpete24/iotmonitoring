// One-off screenshot: node scripts/shot.mjs <path> <out.png> [--width 1440] [--height 900] [--theme light|dark] [--full] [--wait ms]
// Expects `vite preview` (or dev) on --port (default 4179); starts one if nothing answers.
import { chromium } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";

const [, , path, out, ...rest] = process.argv;
const opt = (k, d) => {
  const i = rest.indexOf(`--${k}`);
  return i >= 0 ? rest[i + 1] : d;
};
const width = Number(opt("width", 1440));
const height = Number(opt("height", 900));
const theme = opt("theme", "light");
const full = rest.includes("--full");
const wait = Number(opt("wait", 600));
const port = Number(opt("port", 4179));

let server = null;
const up = await fetch(`http://localhost:${port}/`).then(() => true, () => false);
if (!up) {
  server = spawn("npx", ["vite", "preview", "--port", String(port), "--strictPort"], { shell: true, stdio: "ignore" });
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (await fetch(`http://localhost:${port}/`).then(() => true, () => false)) break;
  }
}
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
  await ctx.addInitScript((t) => localStorage.setItem("tidemark.ui", JSON.stringify({ theme: t, density: "compact" })), theme);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  await page.goto(`http://localhost:${port}${path}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(wait);
  if (full) {
    const h = await page.evaluate(() => {
      const c = document.querySelector("main");
      return c ? c.scrollHeight + c.getBoundingClientRect().top : document.body.scrollHeight;
    });
    await page.setViewportSize({ width, height: Math.min(Math.max(h, height), 8000) });
    await page.waitForTimeout(200);
  }
  await page.screenshot({ path: out });
  console.log(out);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
  if (server) {
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/f", "/t"], { shell: true });
    else server.kill();
  }
  process.exit(process.exitCode ?? 0);
}
