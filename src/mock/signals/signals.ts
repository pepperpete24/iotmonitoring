/**
 * Readings are pure functions: value = f(seed, channel, time, effects).
 * Nothing is stored. Charts sample these on demand and downsample to 800
 * points or fewer.
 */
import type { UtcMs } from "@/domain/common";
import type { Channel, Device } from "@/domain/ingestion";
import { localHour } from "@/lib/format";
import { hashString, WORLD_SEED } from "@/mock/seed";
import { buildingById, type BuildingProfile } from "@/mock/world/buildings";
import { deviceById, topologyOf } from "@/mock/world/topology";
import { demandLpm, demandNorm, nightFloor } from "./demand";
import { active, type Effect, type EffectStore, ramp } from "./effects";

const MIN = 60_000;

// ---- deterministic noise ------------------------------------------------------

function h32(a: number, b: number, c = 0): number {
  let x = (a ^ Math.imul(b, 0x9e3779b1) ^ Math.imul(c, 0x85ebca6b) ^ WORLD_SEED) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}
const unit = (a: number, b: number, c = 0) => h32(a, b, c) / 4294967296;
/** Standard normal from two hashed uniforms. */
function gauss(a: number, b: number, c = 0): number {
  const u = Math.max(1e-9, unit(a, b, c));
  const v = unit(a, b, c + 7919);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Zero-sum noise within each half-hour block: minutes are paired and each
 * pair carries +n and -n. Block averages are therefore exact, which keeps
 * overnight figures (9.4 L/min, 15.6 L/min) exact while minutes look noisy.
 */
function pairedNoise(seed: number, t: UtcMs, sigma: number, resolution: number): number {
  const minute = Math.floor(t / MIN);
  const block = Math.floor(minute / 30);
  const i = minute - block * 30;
  // a fixed shuffle of 0..29 per block, paired (0,1), (2,3) ...
  const order = blockOrder(seed, block);
  const pos = order.indexOf(i);
  const pair = pos >> 1;
  const sign = pos & 1 ? -1 : 1;
  const n = gauss(seed, block, pair) * sigma;
  const q = Math.round(n / resolution) * resolution;
  return sign * q;
}

const orderCache = new Map<string, number[]>();
function blockOrder(seed: number, block: number): number[] {
  const key = `${seed}:${block}`;
  let o = orderCache.get(key);
  if (!o) {
    o = Array.from({ length: 30 }, (_, i) => i);
    for (let i = 29; i > 0; i--) {
      const j = h32(seed, block, i) % (i + 1);
      [o[i], o[j]] = [o[j]!, o[i]!];
    }
    if (orderCache.size > 50_000) orderCache.clear();
    orderCache.set(key, o);
  }
  return o;
}

const quant = (v: number, r: number) => Math.round(v / r) * r;
const round1 = (v: number) => Math.round(v * 10) / 10;

// ---- device context ---------------------------------------------------------

interface Ctx {
  device: Device;
  building: BuildingProfile;
  heightM: number;
  systemType: string | null;
  seed: number;
  boosterShare: number;
}

const ctxCache = new Map<string, Ctx>();
function ctxOf(deviceId: string): Ctx {
  let c = ctxCache.get(deviceId);
  if (c) return c;
  const device = deviceById(deviceId);
  if (!device) throw new Error(`Unknown device ${deviceId}`);
  const building = buildingById.get(device.buildingId)!;
  const topo = topologyOf(building.id);
  const level = topo.levels.find((l) => l.id === device.levelId)!;
  const system = topo.systems.find((s) => s.id === device.systemId);
  // share of demand served by the booster riser (levels 7 and up)
  const boosterShare = building.levels >= 7 ? (building.levels - 6) / building.levels : 0;
  c = { device, building, heightM: level.heightM, systemType: system?.type ?? null, seed: hashString(deviceId), boosterShare };
  ctxCache.set(deviceId, c);
  return c;
}

// ---- effects helpers ---------------------------------------------------------

function valveClosedFactor(b: BuildingProfile, effects: readonly Effect[], t: UtcMs): number {
  // 1 when the booster supply is isolated, ramping over 3 minutes
  let f = 0;
  for (const e of effects) if (e.kind === "valve-closed" && e.buildingId === b.id) f = Math.max(f, ramp(e, t, 3));
  return f;
}

// ---- per measure ----------------------------------------------------------------

/** Share of the building's demand that passes this meter. */
function meterShare(c: Ctx): number {
  const tag = c.device.tag;
  const loc = c.device.location.toLowerCase();
  if (tag === "FT-01") return 1;
  if (loc.includes("booster discharge")) return c.boosterShare;
  if (loc.includes("hot water make-up")) return 0.3;
  if (loc.includes("wing sub-meter")) return 0.38;
  if (loc.includes("food court")) return 0.32;
  if (loc.includes("amenities sub-meter")) return 0.18;
  if (loc.includes("tenancy main")) return 0.36;
  if (loc.includes("sub-meter")) return 0.15;
  return 0.2;
}

function flow(c: Ctx, t: UtcMs, store: EffectStore): number {
  const b = c.building;
  const effects = store.forBuilding(b.id);
  const share = meterShare(c);
  let base = demandLpm(b, t) * share;
  // Booster isolated: the meter stops seeing the booster riser's demand.
  const closed = valveClosedFactor(b, effects, t);
  if (closed > 0) {
    if (c.device.location.toLowerCase().includes("booster discharge")) base *= 1 - closed;
    else if (c.device.tag === "FT-01") base -= demandLpm(b, t) * c.boosterShare * closed;
  }
  let extra = 0;
  for (const e of effects) {
    if (e.kind !== "leak" || !e.meterTags.includes(c.device.tag)) continue;
    extra += e.rateLpm * ramp(e, t, e.rampMin);
  }
  const value = base + extra;
  const sigma = Math.max(0.15, 0.025 * value);
  return round1(Math.max(0, quant(value, 0.1) + pairedNoise(c.seed, t, sigma, 0.1)));
}

/** Supply pressure at street level, kPa, per building. */
function mainsKpa(b: BuildingProfile): number {
  return 470 + (hashString(b.id) % 90);
}

function pressure(c: Ctx, t: UtcMs, store: EffectStore): number {
  const b = c.building;
  const topo = topologyOf(b.id);
  let p: number;
  if (c.systemType === "booster" || c.systemType === "fire-tank") {
    const top = Math.max(...topo.levels.map((l) => l.heightM));
    const low = Math.min(...topo.levels.map((l) => l.heightM));
    const discharge = 9.8 * (top - low) + 360 + (hashString(b.id) % 40);
    p = discharge - 9.8 * (c.heightM - low);
  } else {
    p = mainsKpa(b) - 9.8 * c.heightM;
  }
  // Morning-peak dip, 20 to 40 kPa, proportional to demand.
  const dip = 20 + (c.seed % 21);
  p -= dip * demandNorm(b, t);
  // Isolated booster: the riser drains down to nothing.
  if (c.systemType === "booster") {
    const closed = valveClosedFactor(b, store.forBuilding(b.id), t);
    if (closed > 0) {
      const e = store.forBuilding(b.id).find((x) => x.kind === "valve-closed" && active(x, t));
      const since = e ? (t - e.from) / MIN : 99;
      const decay = Math.exp(-since / 0.5);
      p = p * (1 - closed) + p * closed * decay;
    }
  }
  for (const e of store.forDevice(c.device.id)) {
    if (e.kind === "pressure-offset") p += e.kpa * ramp(e, t, e.rampMin);
  }
  // noise of about 3 kPa, fading to nothing as a drained riser approaches zero
  const noise = (unit(c.seed, Math.floor(t / MIN), 3) * 2 - 1) * 3 * Math.min(1, p / 60);
  return Math.max(0, Math.round(p + noise));
}

/** Tank level before any effect: roof sawtooth, steady fire tank, or the rainwater path. */
function tankBase(c: Ctx, t: UtcMs, effects: readonly Effect[]): number {
  const loc = c.device.location.toLowerCase();
  if (loc.includes("fire")) return 97.6 + 0.8 * Math.sin(t / (36 * 3600_000) + (c.seed % 10));
  if (loc.includes("rainwater")) return rainwaterLevel(c, t, effects);
  // Roof tank: slow sawtooth, fills in about 20 minutes, draws over a few hours.
  const period = (170 + (c.seed % 60)) * MIN;
  const fill = 20 * MIN;
  const phase = (t + (c.seed % 1000) * MIN) % period;
  const lo = 56 + (c.seed % 5);
  const hi = 93 - (c.seed % 4);
  return phase < fill ? lo + ((hi - lo) * phase) / fill : hi - ((hi - lo) * (phase - fill)) / (period - fill);
}

function tankLevel(c: Ctx, t: UtcMs, store: EffectStore): number {
  const effects = store.forDevice(c.device.id);
  let v = tankBase(c, t, effects);
  for (const e of effects) {
    if (e.kind === "tank-fill" && t >= e.from) {
      // From the level when the fault began, move towards `target` (up or down),
      // then recover to normal over about 90 minutes once it ends.
      const v0 = tankBase(c, e.from, effects);
      const end = e.to ?? t;
      const mins = (Math.min(t, end) - e.from) / MIN;
      const moved = e.ratePerMin >= 0 ? Math.min(e.target, v0 + e.ratePerMin * mins) : Math.max(e.target, v0 + e.ratePerMin * mins);
      v = t < end ? moved : v + (moved - v) * Math.exp(-(t - end) / (90 * MIN));
    }
  }
  const noise = (unit(c.seed, Math.floor(t / (5 * MIN)), 5) * 2 - 1) * 0.4;
  return Math.max(0, Math.min(100, Math.round(v + noise)));
}

/**
 * Rainwater tanks fall with use and rise only after rain. The level path is
 * simulated hourly when the world is built (see history/rainwater.ts) and
 * interpolated here.
 */
function rainwaterLevel(c: Ctx, t: UtcMs, _effects: readonly Effect[]): number {
  const path = RAINWATER[c.device.id];
  if (!path) return 60;
  const x = (t - path.t0) / 3_600_000;
  const i = Math.max(0, Math.min(path.hourly.length - 2, Math.floor(x)));
  const f = Math.max(0, Math.min(1, x - i));
  return path.hourly[i]! * (1 - f) + path.hourly[i + 1]! * f;
}

/** Hourly level paths for rainwater tanks, filled in when the world is built. */
export const RAINWATER: Record<string, { t0: UtcMs; hourly: Float64Array }> = {};

function pumpDuty(c: Ctx, t: UtcMs, store: EffectStore): number {
  const b = c.building;
  const loc = c.device.location.toLowerCase();
  let d: number;
  if (loc.includes("circulating")) d = 100;
  else if (loc.includes("rainwater")) d = 6 + 22 * demandNorm(b, t);
  else {
    // Booster pumps alternate lead and lag each day.
    const dayIndex = Math.floor((t + 10 * 3600_000) / 86_400_000);
    const isP1 = c.device.tag.endsWith("1") || c.device.location.includes("P-01");
    const lead = (dayIndex % 2 === 0) === isP1;
    const norm = demandNorm(b, t);
    d = lead ? 3 + 39 * norm : 0.6 + 3 * norm * norm;
    if (b.id === "kendall-street-tower") d = isP1 ? 0.6 + 3 * norm * norm : 3 + 39 * norm; // P-02 leads at Kendall
  }
  for (const e of store.forDevice(c.device.id)) {
    if (e.kind === "pump-duty") {
      const r = ramp(e, t, e.rampMin);
      d = d * (1 - r) + Math.max(d, e.duty) * r;
    }
  }
  if (c.systemType === "booster") {
    const closed = valveClosedFactor(b, store.forBuilding(b.id), t);
    d *= 1 - closed;
  }
  const noise = (unit(c.seed, Math.floor(t / MIN), 9) * 2 - 1) * Math.min(1.5, d * 0.1);
  return Math.max(0, Math.min(100, Math.round(d + noise)));
}

function pumpCurrent(c: Ctx, t: UtcMs, store: EffectStore): number {
  const duty = pumpDuty(c, t, store);
  if (duty >= 99) return round1(2.1 + (unit(c.seed, Math.floor(t / MIN), 11) - 0.5) * 0.1);
  // Run in 8-minute cycles; on for `duty` percent of each.
  const cycle = 8 * MIN;
  const phase = ((t + (c.seed % 480) * 1000) % cycle) / cycle;
  const running = phase < duty / 100;
  return running ? round1(11.2 + (unit(c.seed, Math.floor(t / MIN), 13) - 0.5) * 0.5) : 0;
}

function temperature(c: Ctx, t: UtcMs, store: EffectStore): number {
  const b = c.building;
  const loc = c.device.location.toLowerCase();
  let v: number;
  if (loc.includes("cool room")) {
    const base = COOL_ROOM_BASE[c.device.id] ?? 2.6 + (c.seed % 9) / 10;
    // Defrost: +3 for 20 minutes every 6 hours, at a fixed local phase.
    const phaseH = COOL_ROOM_DEFROST[c.device.id] ?? (c.seed % 6);
    const h = localHour(t, b.zone);
    let defrost = 0;
    for (let k = -1; k <= 4; k++) {
      const centre = phaseH + 6 * k + 10 / 60;
      const d = (h - centre) * 60; // minutes from the defrost centre
      if (Math.abs(d) < 10) defrost = 3 * 0.5 * (1 + Math.cos((Math.PI * d) / 10));
    }
    v = base + defrost;
    for (const e of store.forDevice(c.device.id)) {
      if (e.kind !== "door-open" || t < e.from) continue;
      const end = e.to ?? Infinity;
      const openMin = (Math.min(t, end) - e.from) / MIN;
      const rise = 6 * (1 - Math.exp(-openMin / 25));
      v += t < end ? rise : rise * Math.exp(-(t - end) / (12 * MIN));
    }
  } else if (c.systemType === "hot-water") {
    v = 59 + 1.6 * Math.sin((2 * Math.PI * (localHour(t, b.zone) - 9)) / 24) + (c.seed % 7) / 10 - 0.3;
  } else {
    // plant room air: 18 to 32 across the day
    v = 25 + 6 * Math.sin((2 * Math.PI * (localHour(t, b.zone) - 9)) / 24);
  }
  for (const e of store.forDevice(c.device.id)) {
    if (e.kind === "temperature-offset") v += e.delta * ramp(e, t, e.rampMin);
  }
  const noise = gauss(c.seed, Math.floor(t / (5 * MIN)), 17) * 0.12;
  return round1(v + noise);
}

/** Local hour of each cool room's first defrost, so stories line up. */
export const COOL_ROOM_DEFROST: Record<string, number> = {};
/** Resting temperature of a cool room, where a story needs it exact. */
export const COOL_ROOM_BASE: Record<string, number> = {};

function binary(c: Ctx, t: UtcMs, store: EffectStore, kind: "wet" | "door" | "valve"): number {
  if (kind === "valve") {
    for (const e of store.forBuilding(c.building.id)) {
      if (e.kind === "valve-closed" && e.valveTag === c.device.tag && active(e, t)) return 1;
    }
    return 0;
  }
  for (const e of store.forDevice(c.device.id)) {
    if (kind === "wet" && e.kind === "wet" && active(e, t)) return 1;
    if (kind === "door" && e.kind === "door-open" && e.doorId === c.device.id && active(e, t)) return 1;
  }
  return 0;
}

// ---- public API -------------------------------------------------------------

/** True when the device reports nothing at `t` (gateway down, flat battery). */
export function inGap(deviceId: string, t: UtcMs, store: EffectStore): boolean {
  const d = deviceById(deviceId);
  for (const e of store.forDevice(deviceId)) if (e.kind === "gap" && active(e, t)) return true;
  if (d?.gatewayId) for (const e of store.forDevice(d.gatewayId)) if (e.kind === "gap" && active(e, t)) return true;
  return false;
}

/** The value a channel measured at `t`, or null if the device was not reporting. */
export function sample(channel: Channel, t: UtcMs, store: EffectStore): number | null {
  const c = ctxOf(channel.deviceId);
  if (inGap(channel.deviceId, t, store)) return null;
  for (const e of store.forDevice(channel.deviceId)) {
    if (e.kind === "stuck" && e.channelId === channel.id && active(e, t)) return e.value;
  }
  switch (channel.measure) {
    case "flow":
      return flow(c, t, store);
    case "pressure":
      return pressure(c, t, store);
    case "level":
      return tankLevel(c, t, store);
    case "duty":
      return pumpDuty(c, t, store);
    case "current":
      return pumpCurrent(c, t, store);
    case "temperature":
      return temperature(c, t, store);
    case "wet":
    case "door":
    case "valve":
      return binary(c, t, store, channel.measure);
  }
}

/** The clean water demand at a building's main meter, for loss and baseline maths. */
export function cleanDemand(buildingId: string, t: UtcMs): number {
  return demandLpm(buildingById.get(buildingId)!, t);
}

export { nightFloor };
