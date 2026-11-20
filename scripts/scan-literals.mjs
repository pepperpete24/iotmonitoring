// No hand-typed data numbers in UI code. Scans src/features, src/shell and
// src/components for string or JSX literals that look like readings, money,
// timestamps or incident numbers. Layout numbers (widths, padding) are fine;
// data must come from selectors. Exit 1 on any finding not on the allowlist.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOTS = ["src/features", "src/shell", "src/components"];
const DATA = [
  /\d+(\.\d+)?\s?(L\/min|kL|kPa|°C|dBm)\b/, // readings with units
  /A\$\s?\d/, // money
  /\b\d{1,2}:\d{2}\s?(AEDT|AEST|ACDT|ACST|AWST)\b/, // local times
  /\bI-2026-\d{4}\b/, // incident numbers
  /\b\d+(\.\d+)?%/, // percentages
];
// Examples shown to people as placeholders or format hints, and the rule names the customer set.
const ALLOW = [
  /placeholder=/, // format hints people type over
  /For example/, // worked examples in help text
  /flow_lpm/, // the MQTT payload sample on the integrations page
];

function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(p) && !p.endsWith(".test.ts") ? [p] : [];
  });
}

const findings = [];
for (const file of ROOTS.flatMap(files)) {
  const src = readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  src.split("\n").forEach((line, i) => {
    // only text a person reads: string literals, template text and JSX text
    const texts = [...line.matchAll(/"([^"]*)"|`([^`]*)`|>([^<>{}]+)</g)].map((m) => m[1] ?? m[2] ?? m[3] ?? "");
    for (const t of texts) {
      if (!DATA.some((r) => r.test(t))) continue;
      if (ALLOW.some((r) => r.test(t) || r.test(line))) continue;
      findings.push(`${file}:${i + 1}: ${t.trim()}`);
    }
  });
}

if (findings.length) {
  console.log("Hand-typed data in UI code:\n" + findings.join("\n"));
  process.exit(1);
}
console.log(`No hand-typed data numbers in ${ROOTS.join(", ")}.`);
