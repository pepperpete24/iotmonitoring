// Print a page to PDF the way a person would with "Save as PDF": node scripts/pdf.mjs <path> <out.pdf>
// Expects `vite preview` on port 4179, or starts one.
import { chromium } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";

const [, , path, out] = process.argv;
const port = 4179;
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`http://localhost:${port}${path}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2500);
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: out, preferCSSPageSize: true, printBackground: true });
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
