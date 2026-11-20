// Re-runs the dataviz validator on the colours in src/tokens/tokens.css.
// Fails (exit 1) if any measure palette, status separation or text contrast check fails.
import { readFileSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { validate, contrast } = await import(
  pathToFileURL(path.join(root, ".claude/skills/dataviz/scripts/validate_palette.js")).href
);

const css = readFileSync(path.join(root, "src/tokens/tokens.css"), "utf8");
const block = (selector) => {
  const start = css.indexOf(selector);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  const vars = {};
  for (const m of css.slice(open, close).matchAll(/--([a-z-]+):\s*(#[0-9A-Fa-f]{6})/g)) vars[m[1]] = m[2];
  return vars;
};
const themes = { light: block(':root[data-theme="light"]'), dark: block(':root[data-theme="dark"]') };

let failed = false;
const line = (ok, label, detail) => {
  if (!ok) failed = true;
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label.padEnd(44)} ${detail}`);
};

for (const [mode, t] of Object.entries(themes)) {
  console.log(`\n${mode} theme`);
  const measures = [t.jade, t.gauge, t.thermal];
  const r = validate(measures, { mode, surface: t.paper, pairs: "all" });
  for (const [name, status, detail] of r.report) {
    line(status === true || status === "pass", `measures all-pairs: ${name}`, detail);
  }
  const rg = validate(measures, { mode, surface: t.ground, pairs: "all" });
  const cg = rg.report.find((x) => x[0].startsWith("Contrast"));
  line(cg[1] === true || cg[1] === "pass", "measures contrast on ground", cg[2]);

  const s = validate([...measures, t.critical], { mode, surface: t.paper, pairs: "all" });
  const cvd = s.report.find((x) => x[0].startsWith("CVD"));
  line(cvd[1] === "pass", "critical separated from measures (CVD)", cvd[2]);

  const text = [
    ["ink on paper", t.ink, t.paper, 4.5],
    ["ink on ground", t.ink, t.ground, 4.5],
    ["ink-soft on paper", t["ink-soft"], t.paper, 4.5],
    ["ink-soft on ground", t["ink-soft"], t.ground, 4.5],
    ["jade text on paper", t.jade, t.paper, 4.5],
    ["on-jade on jade (primary button)", t["on-jade"], t.jade, 4.5],
    ["on-critical on critical", t["on-critical"], t.critical, 4.5],
    ["on-warning on warning", t["on-warning"], t.warning, 4.5],
    ["tag-ink on tag-bg", t["tag-ink"], t["tag-bg"], 4.5],
    ["critical glyph on paper", t.critical, t.paper, 3],
    ["ink-soft control outline on paper", t["ink-soft"], t.paper, 3],
  ];
  for (const [label, fg, bg, min] of text) {
    const c = contrast(fg, bg);
    line(c >= min, label, `${c.toFixed(2)}:1 (min ${min})`);
  }
}

console.log(failed ? "\nPalette check FAILED" : "\nPalette check passed");
process.exit(failed ? 1 : 0);
