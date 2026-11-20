/**
 * Rule wording and threshold lines, derived from the customer's rules.
 * Shared by the server views and the UI so a threshold changed in Settings
 * shows everywhere at once.
 */
import type { Rule } from "@/domain/building";
import { formatNumber } from "./format";

interface DeviceLike {
  kind: string;
  tag: string;
  location: string;
}

/** Which rules watch this device. */
export function rulesFor(d: DeviceLike, rules: readonly Rule[]): Rule[] {
  const loc = d.location.toLowerCase();
  const pick = (...ids: string[]) => ids.map((id) => rules.find((r) => r.id === id)).filter((r): r is Rule => !!r);
  switch (d.kind) {
    case "leak-sensor":
      return pick("leak-wet");
    case "flow-meter":
      return d.tag === "FT-01" ? pick("overnight-flow", "burst") : pick("burst");
    case "pressure-sensor":
      return pick("low-pressure");
    case "tank-level":
      return loc.includes("fire") ? pick("tank-low") : pick("tank-low", "tank-high");
    case "pump-monitor":
      return loc.includes("circulating") ? [] : pick("pump-runtime");
    case "temperature-probe":
      return loc.includes("cool room") ? pick("cool-room") : loc.includes("hot water") ? pick("hot-water") : [];
    case "door-contact":
      return pick("door-open");
    case "gateway":
      return pick("device-offline");
    default:
      return [];
  }
}

/** Fleet health limits: when a device needs a battery or a better position. */
export const FLEET = { lowBatteryPct: 20, weakRssiDbm: -110 } as const;

const n = (v: number) => formatNumber(v, v % 1 ? 1 : 0);

/** "Warning when below 200 kPa for 1 min" */
export function ruleSentence(r: Rule): string {
  const sev = r.severity === "critical" ? "Critical" : "Warning";
  const dur = r.minDurationMin ? ` for ${r.minDurationMin} min` : "";
  const when = r.schedule ? ` between ${r.schedule.from} and ${r.schedule.to}` : "";
  switch (r.template) {
    case "leak-wet":
      return `${sev} when wet${dur || " for 1 min"}`;
    case "overnight-flow":
      return `${sev} when overnight flow is ${n(r.threshold)} L/min above baseline${dur}${when}`;
    case "burst":
      return `${sev} when ${n(r.threshold)} L/min above expected${dur}`;
    case "low-pressure":
      return `${sev} when below ${n(r.threshold)} kPa${dur}`;
    case "tank-low":
      return `${sev} when below ${n(r.threshold)}%${dur}`;
    case "tank-high":
      return `${sev} when above ${n(r.threshold)}%${dur}`;
    case "pump-runtime":
      return `${sev} when duty is above ${n(r.threshold)}%${dur}${when}`;
    case "cool-room-temperature":
      return `${sev} when above ${n(r.threshold)} °C${dur}`;
    case "hot-water-temperature":
      return `${sev} when below ${n(r.threshold)} °C${dur}`;
    case "door-open":
      return `${sev} when open${dur}`;
    case "device-offline":
      return `${sev} when not heard${dur}`;
  }
}

/** Horizontal lines for a chart of this measure. */
export function thresholdLines(measure: string, d: DeviceLike, rules: readonly Rule[]): Array<{ value: number; label: string }> {
  const out: Array<{ value: number; label: string }> = [];
  for (const r of rulesFor(d, rules)) {
    if (measure === "pressure" && r.template === "low-pressure") out.push({ value: r.threshold, label: `Minimum ${n(r.threshold)} kPa` });
    if (measure === "level" && r.template === "tank-low") out.push({ value: r.threshold, label: `Low ${n(r.threshold)}%` });
    if (measure === "level" && r.template === "tank-high") out.push({ value: r.threshold, label: `High ${n(r.threshold)}%` });
    if (measure === "temperature" && r.template === "cool-room-temperature") out.push({ value: r.threshold, label: `Limit ${n(r.threshold)} °C` });
    if (measure === "temperature" && r.template === "hot-water-temperature") out.push({ value: r.threshold, label: `Minimum ${n(r.threshold)} °C` });
    if (measure === "duty" && r.template === "pump-runtime") out.push({ value: r.threshold, label: `Overnight limit ${n(r.threshold)}%` });
  }
  return out;
}
