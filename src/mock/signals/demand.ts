/**
 * Water demand by building type: a daily shape, weekday against weekend, a
 * night floor that is exactly flat between 01:00 and 04:00 local, and a
 * daily volume that scales with building size.
 */
import type { BuildingType } from "@/domain/common";
import { DAY, localParts } from "@/lib/format";
import type { BuildingProfile } from "@/mock/world/buildings";
import { hashString } from "@/mock/seed";

/** A raised-cosine bump: 1 at centre, 0 beyond ±halfWidth hours. */
interface Bump {
  c: number;
  w: number;
  a: number;
}

/** Shapes never enter 01:00 to 04:00, so the night floor stays flat there. */
const SHAPES: Record<BuildingType, { weekday: Bump[]; weekend: Bump[] }> = {
  strata: {
    weekday: [
      { c: 7.6, w: 3.2, a: 1.0 },
      { c: 13.5, w: 6.4, a: 0.35 },
      { c: 19.2, w: 3.6, a: 0.9 },
      { c: 23.0, w: 2.0, a: 0.25 },
    ],
    weekend: [
      { c: 9.2, w: 4.6, a: 0.85 },
      { c: 14.0, w: 6.0, a: 0.45 },
      { c: 19.0, w: 3.6, a: 0.85 },
      { c: 23.0, w: 2.0, a: 0.3 },
    ],
  },
  "holiday-apartments": {
    weekday: [
      { c: 8.6, w: 4.2, a: 0.9 },
      { c: 14.0, w: 6.0, a: 0.4 },
      { c: 19.5, w: 3.8, a: 0.8 },
      { c: 23.0, w: 2.0, a: 0.25 },
    ],
    weekend: [
      { c: 9.2, w: 4.6, a: 1.0 },
      { c: 14.0, w: 6.0, a: 0.5 },
      { c: 19.5, w: 3.8, a: 0.9 },
      { c: 23.2, w: 1.8, a: 0.3 },
    ],
  },
  hotel: {
    weekday: [
      { c: 8.0, w: 3.6, a: 1.0 },
      { c: 13.5, w: 5.5, a: 0.4 },
      { c: 19.5, w: 3.6, a: 0.85 },
      { c: 23.0, w: 2.0, a: 0.3 },
    ],
    weekend: [
      { c: 8.8, w: 4.0, a: 1.0 },
      { c: 14.0, w: 5.5, a: 0.45 },
      { c: 19.5, w: 3.6, a: 0.9 },
      { c: 23.0, w: 2.0, a: 0.35 },
    ],
  },
  office: {
    weekday: [
      { c: 9.0, w: 2.6, a: 0.8 },
      { c: 12.8, w: 5.2, a: 1.0 },
      { c: 17.0, w: 2.4, a: 0.35 },
    ],
    weekend: [{ c: 12.0, w: 5.0, a: 0.08 }],
  },
  "aged-care": {
    // flat around the clock with laundry bumps
    weekday: [
      { c: 7.5, w: 3.0, a: 0.55 },
      { c: 10.5, w: 1.6, a: 0.7 },
      { c: 14.0, w: 6.5, a: 0.45 },
      { c: 15.0, w: 1.4, a: 0.6 },
      { c: 19.0, w: 3.0, a: 0.4 },
    ],
    weekend: [
      { c: 7.8, w: 3.0, a: 0.55 },
      { c: 11.0, w: 1.6, a: 0.5 },
      { c: 14.0, w: 6.5, a: 0.45 },
      { c: 19.0, w: 3.0, a: 0.4 },
    ],
  },
  school: {
    weekday: [
      { c: 8.4, w: 1.4, a: 0.6 },
      { c: 11.6, w: 4.2, a: 1.0 },
      { c: 13.0, w: 1.2, a: 0.5 },
      { c: 15.2, w: 1.0, a: 0.3 },
    ],
    weekend: [{ c: 12.0, w: 4.0, a: 0.03 }],
  },
  "shopping-centre": {
    weekday: [
      { c: 15.0, w: 6.6, a: 0.7 },
      { c: 12.6, w: 1.8, a: 0.6 },
      { c: 18.6, w: 1.8, a: 0.45 },
      { c: 8.0, w: 2.0, a: 0.25 },
    ],
    weekend: [
      { c: 14.0, w: 6.0, a: 0.85 },
      { c: 12.6, w: 1.8, a: 0.7 },
      { c: 18.4, w: 1.8, a: 0.4 },
    ],
  },
  healthcare: {
    weekday: [
      { c: 9.5, w: 3.0, a: 0.8 },
      { c: 13.0, w: 5.0, a: 1.0 },
      { c: 16.5, w: 2.4, a: 0.4 },
    ],
    weekend: [{ c: 11.0, w: 3.5, a: 0.25 }],
  },
  retail: {
    weekday: [{ c: 13.5, w: 5.5, a: 1.0 }],
    weekend: [{ c: 12.5, w: 5.0, a: 1.1 }],
  },
};

/** Litres a day per unit of occupancy, and the night floor as a fraction of mean flow. */
const DEMAND: Record<BuildingType, { perUnit: number; nightFrac: number }> = {
  strata: { perUnit: 420, nightFrac: 0.24 },
  "holiday-apartments": { perUnit: 390, nightFrac: 0.2 },
  hotel: { perUnit: 340, nightFrac: 0.17 },
  "aged-care": { perUnit: 290, nightFrac: 0.34 },
  school: { perUnit: 16, nightFrac: 0.02 },
  office: { perUnit: 0.95, nightFrac: 0.035 }, // per m2
  "shopping-centre": { perUnit: 2.6, nightFrac: 0.07 }, // per m2
  healthcare: { perUnit: 3.4, nightFrac: 0.09 }, // per m2
  retail: { perUnit: 1.4, nightFrac: 0.05 }, // per m2
};

function shapeAt(bumps: Bump[], h: number): number {
  let s = 0;
  for (const b of bumps) {
    let d = h - b.c;
    if (d > 12) d -= 24;
    if (d < -12) d += 24;
    if (Math.abs(d) < b.w) s += b.a * 0.5 * (1 + Math.cos((Math.PI * d) / b.w));
  }
  return s;
}

const integrals = new Map<string, number>();
/** Integral of the shape over a day, in shape-units x minutes. */
function shapeIntegral(type: BuildingType, weekend: boolean): number {
  const key = `${type}-${weekend}`;
  let v = integrals.get(key);
  if (v === undefined) {
    v = 0;
    const bumps = SHAPES[type][weekend ? "weekend" : "weekday"];
    for (let m = 0; m < 1440; m++) v += shapeAt(bumps, m / 60);
    integrals.set(key, v);
  }
  return v;
}

export interface DemandModel {
  /** Mean daily volume, litres, on a weekday. */
  dailyL: number;
  /** Typical night floor, L/min. */
  nightLpm: number;
}

/** Kendall Street Tower's overnight floor is set by the brief. */
const NIGHT_OVERRIDE: Record<string, { mean: number; spread: number }> = {
  "kendall-street-tower": { mean: 9.4, spread: 0.9 },
};

export function demandModel(b: BuildingProfile): DemandModel {
  const d = DEMAND[b.type];
  let units = b.occupancy.count;
  if (b.type === "strata" && b.occupancy.extra) units += 8; // retail tenancies at about 8 apartments' worth
  if (b.type === "shopping-centre" || b.type === "office" || b.type === "healthcare" || b.type === "retail") {
    units = b.areaM2 ?? b.occupancy.count;
  }
  // Buildings of the same type differ: fittings, age, tenants. About ±15%, fixed per building.
  const efficiency = 1 + (((hashString(`eff:${b.id}`) % 1001) / 1000) - 0.5) * 0.3;
  const dailyL = units * d.perUnit * efficiency;
  const night = NIGHT_OVERRIDE[b.id]?.mean ?? Math.round((dailyL / 1440) * d.nightFrac * 10) / 10;
  return { dailyL, nightLpm: night };
}

/** The local calendar date (y, m, d) that owns the night floor in force at `t`. */
function nightKey(t: number, zone: string): string {
  // Before noon belongs to tonight-just-gone; after noon to the coming night.
  const p = localParts(t + 12 * 3600_000, zone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Night floor for the night that owns `t`. Varies a little night to night. */
export function nightFloor(b: BuildingProfile, t: number): number {
  const base = demandModel(b).nightLpm;
  const key = nightKey(t, b.zone);
  const o = NIGHT_OVERRIDE[b.id];
  // the morning of the demo is the brief's reference night
  if (o && key === "2026-11-20") return o.mean;
  const u = ((hashString(`${b.id}:${key}`) % 2001) / 1000 - 1) * 0.85; // -0.85..0.85
  const spread = o?.spread ?? base * 0.07;
  return Math.round((base + u * spread) * 10) / 10;
}

export function isWeekend(t: number, zone: string): boolean {
  const w = localParts(t, zone).weekday;
  return w === 0 || w === 6;
}

/** Clean demand in L/min at the main meter, before leaks and noise. */
export function demandLpm(b: BuildingProfile, t: number): number {
  const p = localParts(t, b.zone);
  const h = p.hour + p.minute / 60 + p.second / 3600;
  const weekend = p.weekday === 0 || p.weekday === 6;
  const night = nightFloor(b, t);
  const model = demandModel(b);
  // offices, schools and clinics use far less at weekends
  const base = weekend && (b.type === "office" || b.type === "school" || b.type === "healthcare") ? model.dailyL * 0.12 : model.dailyL;
  // Day to day, use varies with weather and occupancy: about ±8%, fixed per building and date.
  const dayKey = `${b.id}#${p.year}-${p.month}-${p.day}`;
  const volume = base * (1 + (((hashString(dayKey) % 2001) / 1000 - 1) * 0.08));
  const k = Math.max(0, volume - 1440 * night) / shapeIntegral(b.type, weekend);
  return night + k * shapeAt(SHAPES[b.type][weekend ? "weekend" : "weekday"], h);
}

/** Demand as 0 (night floor) to 1 (the day's peak), for pressure dips and pump duty. */
const peaks = new Map<string, number>();
export function demandNorm(b: BuildingProfile, t: number): number {
  const p = localParts(t, b.zone);
  const weekend = p.weekday === 0 || p.weekday === 6;
  const bumps = SHAPES[b.type][weekend ? "weekend" : "weekday"];
  const key = `${b.type}-${weekend}`;
  let peak = peaks.get(key);
  if (peak === undefined) {
    peak = 0;
    for (let m = 0; m < 1440; m += 5) peak = Math.max(peak, shapeAt(bumps, m / 60));
    peaks.set(key, peak);
  }
  const h = p.hour + p.minute / 60;
  return peak ? shapeAt(bumps, h) / peak : 0;
}

export const DAY_MS = DAY;
