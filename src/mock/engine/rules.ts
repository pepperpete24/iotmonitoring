/**
 * Rule evaluation. Each rule watches channels of one measure and holds a
 * condition for a minimum duration before it raises an alert, and clears
 * with hysteresis.
 */
import type { Rule } from "@/domain/building";
import type { UtcMs } from "@/domain/common";
import type { Channel, Device } from "@/domain/ingestion";
import { localHour } from "@/lib/format";
import { buildingById } from "@/mock/world/buildings";
import { RULES } from "@/mock/world/rules";
import { allDevices } from "@/mock/world/topology";
import type { EffectStore } from "@/mock/signals/effects";
import { cleanDemand, inGap, nightFloor, sample } from "@/mock/signals/signals";

export interface Watch {
  key: string;
  rule: Rule;
  device: Device;
  channel: Channel | null;
}

/** Which rules watch which channels. */
export function buildWatches(): Watch[] {
  const out: Watch[] = [];
  const rule = (id: string) => RULES.find((r) => r.id === id)!;
  for (const d of allDevices()) {
    const loc = d.location.toLowerCase();
    const ch = (m: string) => d.channels.find((c) => c.measure === m) ?? null;
    const add = (ruleId: string, c: Channel | null) => out.push({ key: `${ruleId}|${d.id}`, rule: rule(ruleId), device: d, channel: c });
    switch (d.kind) {
      case "leak-sensor":
        add("leak-wet", ch("wet"));
        break;
      case "flow-meter":
        add("burst", ch("flow"));
        if (d.tag === "FT-01") add("overnight-flow", ch("flow"));
        break;
      case "pressure-sensor":
        add("low-pressure", ch("pressure"));
        break;
      case "tank-level":
        if (!loc.includes("fire")) add("tank-high", ch("level"));
        add("tank-low", ch("level"));
        break;
      case "pump-monitor":
        if (!loc.includes("circulating")) add("pump-runtime", ch("duty"));
        break;
      case "temperature-probe":
        if (loc.includes("cool room")) add("cool-room", ch("temperature"));
        else if (loc.includes("hot water")) add("hot-water", ch("temperature"));
        break;
      case "door-contact":
        add("door-open", ch("door"));
        break;
      case "gateway":
        add("device-offline", null);
        break;
    }
  }
  return out;
}

const share = (d: Device) => {
  const loc = d.location.toLowerCase();
  if (d.tag === "FT-01") return 1;
  if (loc.includes("food court")) return 0.32;
  if (loc.includes("tenancy main")) return 0.36;
  if (loc.includes("amenities")) return 0.18;
  if (loc.includes("wing")) return 0.38;
  return null;
};

function inSchedule(rule: Rule, t: UtcMs, zone: string): boolean {
  if (!rule.schedule) return true;
  const h = localHour(t, zone);
  const [fh, fm] = rule.schedule.from.split(":").map(Number) as [number, number];
  const [th, tm] = rule.schedule.to.split(":").map(Number) as [number, number];
  return h >= fh + fm / 60 && h < th + tm / 60;
}

/**
 * Whether the rule's condition holds at `t`. `wasAlerting` applies
 * hysteresis: an alerting condition needs to clear past the threshold.
 * Returns null when there is no data to judge.
 */
export function conditionAt(w: Watch, t: UtcMs, store: EffectStore, wasAlerting: boolean): { holds: boolean; value: number } | null {
  const b = buildingById.get(w.device.buildingId)!;
  const r = w.rule;
  const hys = wasAlerting ? r.hysteresis : 0;
  if (r.template === "device-offline") {
    const offline = inGap(w.device.id, t, store);
    return { holds: offline, value: offline ? 1 : 0 };
  }
  if (!w.channel) return null;
  const v = sample(w.channel, t, store);
  if (v === null) return null;
  switch (r.template) {
    case "leak-wet":
    case "door-open":
      return { holds: v >= 1, value: v };
    case "burst": {
      const s = share(w.device);
      if (s === null) return { holds: false, value: v };
      const excess = v - cleanDemand(b.id, t) * s;
      return { holds: excess > r.threshold - hys, value: Math.round(excess * 10) / 10 };
    }
    case "overnight-flow": {
      if (!inSchedule(r, t, b.zone)) return { holds: false, value: v };
      const excess = v - nightFloor(b, t);
      return { holds: excess > r.threshold - hys, value: v };
    }
    case "low-pressure":
      return { holds: v < r.threshold + hys, value: v };
    case "tank-low":
      return { holds: v < r.threshold + hys, value: v };
    case "tank-high":
      return { holds: v > r.threshold - hys, value: v };
    case "pump-runtime":
      if (!inSchedule(r, t, b.zone)) return { holds: false, value: v };
      return { holds: v > r.threshold - hys, value: v };
    case "cool-room-temperature":
      return { holds: v > r.threshold - hys, value: v };
    case "hot-water-temperature":
      return { holds: v < r.threshold + hys, value: v };
    default:
      return null;
  }
}
