/** Device detail and water analytics responses. */
import type { DeviceDetail, WaterView } from "@/api/types";
import type { UtcMs } from "@/domain/common";
import { DAY, formatNumber, fromLocal, HOUR, localParts, MINUTE } from "@/lib/format";
import type { Engine } from "@/mock/engine/engine";
import { DEMO_START } from "@/mock/scenarios/clock";
import { lastCompletedNight, nightBaseline, nightFlow, waterLostL } from "@/mock/selectors/compute";
import { cleanDemand, sample } from "@/mock/signals/signals";
import { healthAt, uplinksBetween } from "@/mock/signals/uplinks";
import { BUILDINGS, buildingById, type BuildingProfile } from "@/mock/world/buildings";
import { personName } from "@/mock/world/people";
import { deviceById, topologyOf } from "@/mock/world/topology";
import { RULES } from "@/mock/world/rules";
import { ruleSentence, rulesFor } from "@/lib/ruleText";
import { deviceLive } from "./views-building";

export function deviceDetail(engine: Engine, id: string, now: UtcMs): DeviceDetail | null {
  const d = deviceById(id);
  if (!d) return null;
  const b = buildingById.get(d.buildingId)!;
  const topo = topologyOf(b.id);
  const fx = engine.world.effects;
  const ov = engine.deviceOverrides.get(d.id);
  const battery: Array<[UtcMs, number]> = [];
  for (let k = 89; k >= 0; k--) {
    const t = now - k * DAY;
    battery.push([t, healthAt(d.id, t, DEMO_START).battery]);
  }
  const signal: Array<[UtcMs, number | null, number | null]> = [];
  const startH = Math.floor((now - 7 * DAY) / HOUR) * HOUR;
  for (let t = startH; t <= now; t += HOUR) {
    const ups = uplinksBetween(d.id, t, t + HOUR, fx, 4);
    if (!ups.length) signal.push([t, null, null]);
    else {
      const h = healthAt(d.id, ups[0]!, DEMO_START);
      signal.push([t, h.rssi, h.snr]);
    }
  }
  const recent = uplinksBetween(d.id, now - (d.uplinkS * 1000 * 40 + 6 * HOUR), now + 1, fx, 5000).slice(-20).reverse();
  const uplinks = recent.map((at) => {
    const h = healthAt(d.id, at, DEMO_START);
    const values = d.channels
      .map((c) => {
        const v = sample(c, at, fx);
        if (v === null) return "";
        if (c.measure === "wet") return v ? "Wet" : "Dry";
        if (c.measure === "door") return v ? "Open" : "Closed";
        if (c.measure === "valve") return v ? "Closed" : "Open";
        const unit = { flow: " L/min", pressure: " kPa", level: "%", temperature: " °C", current: " A", duty: "% duty" }[c.measure as string] ?? "";
        const decimals = c.measure === "flow" || c.measure === "temperature" || c.measure === "current" ? 1 : 0;
        return `${formatNumber(v, decimals)}${unit}`;
      })
      .filter(Boolean)
      .join(", ");
    return { at, rssi: h.rssi, snr: h.snr, battery: h.battery, values: values || "Heartbeat" };
  });
  const gaps: DeviceDetail["gaps"] = [];
  for (const gid of [d.id, ...(d.gatewayId ? [d.gatewayId] : [])]) {
    for (const e of fx.forDevice(gid)) if (e.kind === "gap" && e.from <= now) gaps.push({ from: e.from, to: e.to ?? now, reason: e.reason });
  }
  return {
    device: deviceLive(engine, d, now),
    buildingName: b.name,
    zone: b.zone,
    levelLabel: topo.levels.find((l) => l.id === d.levelId)?.label ?? "",
    systemName: topo.systems.find((s) => s.id === d.systemId)?.name ?? null,
    installer: personName(d.installer),
    installedAt: d.installedAt,
    calibratedAt: d.calibratedAt,
    replacedAt: ov?.replacedAt ?? null,
    lossRatePct: Math.round(d.lossRate * 1000) / 10,
    rules: rulesFor(d, RULES).map(ruleSentence),
    battery,
    signal,
    uplinks,
    gaps,
  };
}

// ---- water --------------------------------------------------------------------

const memo = new Map<string, number>();
/** Litres through a building's main meter in [from, to), sampled every 15 minutes. */
function litres(engine: Engine, b: BuildingProfile, from: UtcMs, to: UtcMs, step = 15 * MINUTE): number {
  const key = `${b.id}|${from}|${to}|${step}|${engine.world.effects.revision}`;
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  const ch = deviceById(`${b.id}/FT-01`)!.channels[0]!;
  let l = 0;
  for (let t = from; t < to; t += step) {
    const v = sample(ch, t + step / 2, engine.world.effects);
    if (v !== null) l += v * (step / MINUTE);
    else l += cleanDemand(b.id, t) * (step / MINUTE); // fill a reporting gap with the expected flow
  }
  if (memo.size > 20000) memo.clear();
  memo.set(key, l);
  return l;
}

const UNIT_LABEL: Record<string, string> = {
  apartments: "per apartment",
  rooms: "per room",
  beds: "per bed",
  students: "per student",
  tenancies: "per 100 m²",
  m2: "per 100 m²",
};

export function waterView(engine: Engine, buildingId: string | null, now: UtcMs): WaterView {
  const scope = buildingId ? BUILDINGS.filter((b) => b.id === buildingId) : [...BUILDINGS];
  const zone = scope[0]!.zone;
  const p = localParts(now, zone);
  const todayStart = fromLocal(zone, p.year, p.month, p.day, 0, 0);
  // days: the 30 completed local days before today
  const daily: WaterView["daily"] = [];
  for (let k = 30; k >= 1; k--) {
    const day = todayStart - k * DAY;
    const actualL = scope.reduce((s, b) => s + litres(engine, b, day, day + DAY), 0);
    let usual = 0;
    for (let w = 1; w <= 4; w++) usual += scope.reduce((s, b) => s + litres(engine, b, day - w * 7 * DAY, day - w * 7 * DAY + DAY, 60 * MINUTE), 0);
    daily.push({ day, actualL, expectedL: usual / 4 });
  }
  const hourly: WaterView["hourly"] = [];
  const h0 = Math.floor(now / HOUR) * HOUR - 47 * HOUR;
  for (let t = h0; t < now - HOUR + 1; t += HOUR) {
    const actualL = scope.reduce((s, b) => s + litres(engine, b, t, t + HOUR, 5 * MINUTE), 0);
    let usual = 0;
    for (let w = 1; w <= 4; w++) usual += scope.reduce((s, b) => s + litres(engine, b, t - w * 7 * DAY, t - w * 7 * DAY + HOUR, 15 * MINUTE), 0);
    hourly.push({ t, actualL, expectedL: usual / 4 });
  }

  // a night breaches when it runs the overnight-flow rule's margin above its usual
  const margin = RULES.find((r) => r.id === "overnight-flow")!.threshold;

  // overnight baseline for one building
  const nb = buildingById.get(buildingId ?? "kendall-street-tower")!;
  const last = lastCompletedNight(nb, now);
  const cache = new Map<number, number | null>();
  const points: WaterView["nights"]["points"] = [];
  for (let k = 29; k >= 0; k--) {
    const night = last - k * DAY;
    const value = nightFlow(engine, nb, night);
    cache.set(night, value);
    const base = nightBaseline(engine, nb, night, cache);
    points.push({ night, value, p10: base.p10, p50: base.median, p90: base.p90, breach: value !== null && value - base.median >= margin });
  }

  // anomalies across the scope: nights 3 L/min or more above the building's own baseline
  const anomalies: WaterView["anomalies"] = [];
  for (const b of scope) {
    const lb = lastCompletedNight(b, now);
    const c2 = new Map<number, number | null>();
    for (let k = 29; k >= 0; k--) {
      const night = lb - k * DAY;
      const v = nightFlow(engine, b, night);
      c2.set(night, v);
      if (v === null) continue;
      const base = nightBaseline(engine, b, night, c2);
      if (v - base.median >= margin) {
        const inc = engine.world.incidents.find((i) => i.buildingId === b.id && i.openedAt <= night + 4 * HOUR && (i.resolvedAt ?? now) >= night - 2 * HOUR && i.leak);
        anomalies.push({ buildingId: b.id, name: b.name, night, value: v, baseline: base.median, excess: Math.round((v - base.median) * 10) / 10, incidentId: inc?.id ?? null });
      }
    }
  }
  anomalies.sort((a, z) => z.night - a.night);

  // benchmark: last 7 days per unit, buildings of the same type, normalisation stated
  const groups = new Map<string, Array<{ buildingId: string; name: string; perUnitL: number }>>();
  const unitOf = new Map<string, string>();
  for (const b of BUILDINGS) {
    const l7 = litres(engine, b, todayStart - 7 * DAY, todayStart, 60 * MINUTE) / 7;
    const per = b.occupancy.kind === "m2" || b.occupancy.kind === "tenancies" ? l7 / ((b.areaM2 ?? b.occupancy.count) / 100) : l7 / b.occupancy.count;
    const type = b.type === "holiday-apartments" ? "strata" : b.type === "retail" ? "shopping-centre" : b.type;
    groups.set(type, [...(groups.get(type) ?? []), { buildingId: b.id, name: b.name, perUnitL: Math.round(per) }]);
    unitOf.set(type, UNIT_LABEL[b.occupancy.kind === "tenancies" ? "m2" : b.occupancy.kind]!);
  }
  const benchmark = [...groups.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([type, rows]) => ({ type, unitLabel: `Litres a day ${unitOf.get(type)}`, rows: rows.sort((a, z) => z.perUnitL - a.perUnitL) }));

  const last30L = daily.reduce((s, d) => s + d.actualL, 0);
  const usual30L = daily.reduce((s, d) => s + d.expectedL, 0);
  const leakLossL = engine.world.incidents
    .filter((i) => (!buildingId || i.buildingId === buildingId) && i.leak && (i.leak.to ?? now) >= now - 30 * DAY)
    .reduce((s, i) => s + (waterLostL(i, now) ?? 0), 0);
  const t = engine.tariffPerKL;
  return {
    scope: { buildingId, name: buildingId ? nb.name : `All ${BUILDINGS.length} buildings` },
    tariffPerKL: t,
    breachMarginLpm: margin,
    daily,
    hourly,
    nights: { buildingId: nb.id, name: nb.name, points },
    anomalies,
    benchmark,
    totals: {
      last30L,
      usual30L,
      cost30AUD: Math.round((last30L / 1000) * t * 100) / 100,
      leakLossL,
      leakCostAUD: Math.round((leakLossL / 1000) * t * 100) / 100,
    },
  };
}
