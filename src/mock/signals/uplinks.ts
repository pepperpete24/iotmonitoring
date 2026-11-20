/**
 * When devices report. Each device uplinks on its own cadence with a fixed
 * offset and a few seconds of jitter; some lose 1 to 3% of uplinks; event
 * devices (leak, door, valve) also uplink the moment their state changes.
 */
import type { UtcMs } from "@/domain/common";
import type { Channel, Device } from "@/domain/ingestion";
import { hashString } from "@/mock/seed";
import { deviceById } from "@/mock/world/topology";
import type { EffectStore } from "./effects";
import { inGap, sample } from "./signals";

const offsetOf = (d: Device) => (hashString(d.id) % (d.uplinkS * 1000));

function uplinkAt(d: Device, k: number): UtcMs {
  const jitter = ((hashString(`${d.id}#${k}`) % 10_001) - 5_000) | 0; // ±5 s
  return k * d.uplinkS * 1000 + offsetOf(d) + jitter;
}

function lost(d: Device, k: number): boolean {
  return d.lossRate > 0 && (hashString(`${d.id}~${k}`) % 10_000) / 10_000 < d.lossRate;
}

const EVENT_KINDS = new Set(["leak-sensor", "door-contact", "valve-controller"]);

/** Last time the device reported at or before `t`, or null if not within the look-back. */
export function lastUplink(deviceId: string, t: UtcMs, store: EffectStore, lookBackMs = 4 * 86_400_000): UtcMs | null {
  const d = deviceById(deviceId);
  if (!d) return null;
  const period = d.uplinkS * 1000;
  let k = Math.floor((t - offsetOf(d)) / period) + 1;
  let best: UtcMs | null = null;
  const floor = t - lookBackMs;
  for (let i = 0; i < 4000; i++, k--) {
    const at = uplinkAt(d, k);
    if (at < floor) break;
    if (at > t) continue;
    if (lost(d, k) || inGap(d.id, at, store)) {
      // inside a long gap, jump to its start instead of walking minute by minute
      const gapStart = gapStartBefore(d, at, store);
      if (gapStart !== null) k = Math.floor((gapStart - offsetOf(d)) / period) + 1;
      continue;
    }
    best = at;
    break;
  }
  if (EVENT_KINDS.has(d.kind)) {
    // state changes are sent immediately
    for (const e of store.forDevice(d.id)) {
      for (const edge of [e.from, e.to]) {
        if (edge !== null && edge <= t && edge >= floor && (best === null || edge > best) && !inGap(d.id, edge, store)) {
          if (e.kind === "wet" || e.kind === "door-open") best = edge;
        }
      }
    }
    for (const e of store.forBuilding(d.buildingId)) {
      if (e.kind === "valve-closed" && e.valveTag === d.tag) {
        for (const edge of [e.from, e.to]) if (edge !== null && edge <= t && (best === null || edge > best)) best = edge;
      }
    }
  }
  return best;
}

function gapStartBefore(d: Device, at: UtcMs, store: EffectStore): UtcMs | null {
  let start: UtcMs | null = null;
  const ids = [d.id, ...(d.gatewayId ? [d.gatewayId] : [])];
  for (const id of ids) {
    for (const e of store.forDevice(id)) {
      if (e.kind === "gap" && at >= e.from && (e.to === null || at < e.to)) {
        start = start === null ? e.from : Math.min(start, e.from);
      }
    }
  }
  return start !== null && start < at ? start - 1 : null;
}

/** All uplink times in [from, to), for "last 20 uplinks" and charts of health. */
export function uplinksBetween(deviceId: string, from: UtcMs, to: UtcMs, store: EffectStore, limit = 2000): UtcMs[] {
  const d = deviceById(deviceId);
  if (!d) return [];
  const period = d.uplinkS * 1000;
  const out: UtcMs[] = [];
  let k = Math.floor((from - offsetOf(d)) / period);
  for (;;) {
    const at = uplinkAt(d, k++);
    if (at >= to || out.length >= limit) break;
    if (at < from || lost(d, k - 1) || inGap(d.id, at, store)) continue;
    out.push(at);
  }
  return out;
}

/** The value a device last reported for a channel, and when. */
export function lastReading(channel: Channel, t: UtcMs, store: EffectStore): { t: UtcMs; value: number } | null {
  const at = lastUplink(channel.deviceId, t, store);
  if (at === null) return null;
  const value = sample(channel, at, store);
  return value === null ? null : { t: at, value };
}

/** Signal strength and battery at an uplink. */
export function healthAt(deviceId: string, t: UtcMs, startAt: UtcMs): { rssi: number; snr: number; battery: number } {
  const d = deviceById(deviceId)!;
  const k = Math.floor(t / 60_000);
  const r = (hashString(`${d.id}@${k}`) % 1000) / 1000;
  const s = (hashString(`${d.id}^${k}`) % 1000) / 1000;
  const days = (t - startAt) / 86_400_000;
  const battery = Math.max(0, Math.min(100, d.batteryAtStart - d.batteryDrainPerDay * days));
  return {
    rssi: Math.round(d.rssi + (r - 0.5) * 7),
    snr: Math.round((d.snr + (s - 0.5) * 4) * 10) / 10,
    battery: Math.round(battery * 10) / 10,
  };
}
