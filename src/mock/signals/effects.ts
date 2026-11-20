/**
 * Effects: what happened in the physical world, as data. History fixtures,
 * the hero scenario and the live engine all add effects; the signal
 * functions read them. A reading is f(seed, channel, time, effects).
 */
import type { UtcMs } from "@/domain/common";

interface Span {
  from: UtcMs;
  /** null: still happening. */
  to: UtcMs | null;
}

export type Effect =
  /** Extra flow through a building's meters, for example a leak or burst. */
  | (Span & { kind: "leak"; buildingId: string; meterTags: string[]; rateLpm: number; rampMin: number; note: string })
  /** A leak sensor reads wet. */
  | (Span & { kind: "wet"; deviceId: string })
  /** Pump duty forced to a level, for example a failing seal making it run on. */
  | (Span & { kind: "pump-duty"; deviceId: string; duty: number; rampMin: number })
  /** An isolation valve is closed. */
  | (Span & { kind: "valve-closed"; buildingId: string; valveTag: string })
  /** Pressure shifted at these sensors. */
  | (Span & { kind: "pressure-offset"; deviceIds: string[]; kpa: number; rampMin: number })
  /** A cool room door is open. */
  | (Span & { kind: "door-open"; doorId: string; probeId: string })
  /** Temperature shifted, for example a hot water unit fault. */
  | (Span & { kind: "temperature-offset"; deviceId: string; delta: number; rampMin: number })
  /** Tank level forced along a path, for example a stuck float valve overfilling. */
  | (Span & { kind: "tank-fill"; deviceId: string; target: number; ratePerMin: number })
  /** Rain into a rainwater tank. */
  | (Span & { kind: "rain"; deviceIds: string[]; points: number })
  /** No data from these devices. */
  | (Span & { kind: "gap"; deviceIds: string[]; reason: string })
  /** A channel stuck on one value. */
  | (Span & { kind: "stuck"; channelId: string; value: number })
  /** Alerts paused for maintenance. Signals unaffected; the engine reads it. */
  | (Span & { kind: "mute"; deviceIds: string[]; reason: string; by: string });

export type EffectKind = Effect["kind"];

/** Index of effects by the device ids and building ids they touch. */
export class EffectStore {
  private all: Effect[] = [];
  private byDevice = new Map<string, Effect[]>();
  private byBuilding = new Map<string, Effect[]>();
  private version = 0;

  constructor(initial: Effect[] = []) {
    for (const e of initial) this.add(e);
  }

  get revision() {
    return this.version;
  }

  list(): readonly Effect[] {
    return this.all;
  }

  add(e: Effect): Effect {
    this.all.push(e);
    for (const id of deviceIdsOf(e)) push(this.byDevice, id, e);
    const b = buildingOf(e);
    if (b) push(this.byBuilding, b, e);
    this.version++;
    return e;
  }

  /** End an open effect at `at`. */
  end(e: Effect, at: UtcMs) {
    e.to = at;
    this.version++;
  }

  forDevice(id: string): readonly Effect[] {
    return this.byDevice.get(id) ?? EMPTY;
  }

  forBuilding(id: string): readonly Effect[] {
    return this.byBuilding.get(id) ?? EMPTY;
  }

  /** Remove every effect that starts at or after `t` and reopen nothing. Used by reset. */
  truncateAfter(t: UtcMs) {
    const keep = this.all.filter((e) => e.from < t);
    this.all = [];
    this.byDevice.clear();
    this.byBuilding.clear();
    for (const e of keep) this.add(e);
  }
}

const EMPTY: readonly Effect[] = [];

function push(map: Map<string, Effect[]>, key: string, e: Effect) {
  const list = map.get(key);
  if (list) list.push(e);
  else map.set(key, [e]);
}

function deviceIdsOf(e: Effect): string[] {
  switch (e.kind) {
    case "wet":
    case "pump-duty":
    case "temperature-offset":
    case "tank-fill":
      return [e.deviceId];
    case "door-open":
      return [e.doorId, e.probeId];
    case "pressure-offset":
    case "gap":
    case "mute":
    case "rain":
      return e.deviceIds;
    case "stuck":
      return [e.channelId.split("/").slice(0, 2).join("/")];
    default:
      return [];
  }
}

function buildingOf(e: Effect): string | null {
  if (e.kind === "leak" || e.kind === "valve-closed") return e.buildingId;
  const first = deviceIdsOf(e)[0];
  return first ? first.split("/")[0]! : null;
}

export const active = (e: { from: UtcMs; to: UtcMs | null }, t: UtcMs) => t >= e.from && (e.to === null || t < e.to);

/** 0 to 1 ramp in from `from` over `rampMin`, and out after `to` over the same. */
export function ramp(e: { from: UtcMs; to: UtcMs | null }, t: UtcMs, rampMin: number): number {
  if (t < e.from) return 0;
  const r = Math.max(1, rampMin) * 60_000;
  const up = Math.min(1, (t - e.from) / r);
  if (e.to === null || t < e.to) return up;
  const down = 1 - (t - e.to) / r;
  return down > 0 ? Math.min(up, down) : 0;
}
