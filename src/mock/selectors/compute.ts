/**
 * Selectors: every number the UI shows is computed here from the engine's
 * world. Components never hold numbers of their own.
 */
import type { Incident, Notification } from "@/domain/building";
import { type AnnunciatorState, type Status, STATUS_RANK, type UtcMs, worstStatus } from "@/domain/common";
import type { Device } from "@/domain/ingestion";
import { DAY, fromLocal, localParts, MINUTE } from "@/lib/format";
import type { Engine } from "@/mock/engine/engine";
import { sentOnly } from "@/mock/engine/escalation";
import { active } from "@/mock/signals/effects";
import { inGap, sample } from "@/mock/signals/signals";
import { healthAt, lastUplink } from "@/mock/signals/uplinks";
import { DEMO_START } from "@/mock/scenarios/clock";
import { BUILDINGS, buildingById, type BuildingProfile } from "@/mock/world/buildings";
import { ruleById } from "@/mock/world/rules";
import { allDevices, deviceById, onFleetChange, topologyOf } from "@/mock/world/topology";

// ---- incidents ---------------------------------------------------------------

export function waterLostL(inc: Incident, now: UtcMs): number | null {
  if (!inc.leak) return null;
  const end = Math.min(now, inc.leak.to ?? now);
  return Math.max(0, ((end - inc.leak.from) / MINUTE) * inc.leak.rateLpm);
}

export function costAUD(litres: number | null, tariffPerKL: number): number | null {
  return litres === null ? null : Math.round((litres / 1000) * tariffPerKL * 100) / 100;
}

/** If left unattended: a day of the current leak rate. */
export function dailyLossL(inc: Incident): number | null {
  if (!inc.leak || inc.leak.to !== null) return null;
  return inc.leak.rateLpm * 1440;
}

export interface EscalationSummary {
  steps: number;
  messages: number;
  delivered: number;
  failed: number;
  held: number;
  acknowledged: boolean;
}

export function escalationSummary(inc: Incident, notifications: readonly Notification[]): EscalationSummary {
  const ns = notifications.filter((n) => n.incidentId === inc.id && n.stepSeq !== null);
  const sent = sentOnly(ns);
  return {
    steps: new Set(ns.map((n) => n.stepSeq)).size,
    messages: sent.length,
    delivered: sent.filter((n) => n.result === "delivered" || n.result === "read").length,
    failed: sent.filter((n) => n.result === "failed").length,
    held: ns.filter((n) => n.result === "held").length,
    acknowledged: inc.acknowledgedAt !== null,
  };
}

/** Annunciator state for one building from its open incidents' alerts and its devices. */
export function annunciatorFor(engine: Engine, buildingId: string, now: UtcMs): AnnunciatorState {
  const ann: AnnunciatorState = {};
  const light = (ch: keyof AnnunciatorState, s: Status) => {
    const cur = ann[ch];
    if (!cur || STATUS_RANK[s] < STATUS_RANK[cur]) ann[ch] = s;
  };
  for (const inc of engine.world.incidents) {
    if (inc.buildingId !== buildingId || inc.state === "resolved") continue;
    for (const id of inc.alertIds) {
      const a = engine.world.alerts.find((x) => x.id === id);
      if (!a || (a.clearedAt !== null && a.clearedAt <= now)) continue;
      light(ruleById.get(a.ruleId)!.annunciator, a.severity);
    }
    // an open incident keeps its own window lit even after its alerts clear
    light(inc.channel, inc.severity);
  }
  for (const d of devicesOf(buildingId)) {
    const st = deviceState(engine, d, now);
    if (st === "offline") light("link", "offline");
  }
  return ann;
}

// ---- devices ---------------------------------------------------------------------

export type DeviceStatus = "online" | "offline" | "paused" | "muted";

const devicesByBuilding = new Map<string, Device[]>();
onFleetChange(() => devicesByBuilding.clear());
export function devicesOf(buildingId: string): Device[] {
  let list = devicesByBuilding.get(buildingId);
  if (!list) {
    list = allDevices().filter((d) => d.buildingId === buildingId);
    devicesByBuilding.set(buildingId, list);
  }
  return list;
}

/**
 * Offline: the device itself has stopped reporting. Paused: its gateway is
 * offline, so its readings are held up. Muted: reporting, alerts paused.
 */
export function deviceState(engine: Engine, d: Device, now: UtcMs): DeviceStatus {
  const fx = engine.world.effects;
  for (const e of fx.forDevice(d.id)) if (e.kind === "gap" && active(e, now)) return "offline";
  if (d.gatewayId && inGap(d.gatewayId, now, fx)) return "paused";
  for (const e of fx.forDevice(d.id)) if (e.kind === "mute" && active(e, now)) return "muted";
  return "online";
}

export function deviceHealth(engine: Engine, d: Device, now: UtcMs) {
  const last = lastUplink(d.id, now, engine.world.effects);
  const h = healthAt(d.id, last ?? now, DEMO_START);
  return { lastUplink: last, ...h };
}

export interface FleetExceptions {
  offline: Device[];
  paused: Device[];
  muted: Device[];
  lowBattery: Device[];
  weakSignal: Device[];
}

export function fleetExceptions(engine: Engine, now: UtcMs): FleetExceptions {
  const out: FleetExceptions = { offline: [], paused: [], muted: [], lowBattery: [], weakSignal: [] };
  for (const d of allDevices()) {
    const st = deviceState(engine, d, now);
    if (st === "offline") out.offline.push(d);
    if (st === "paused") out.paused.push(d);
    if (st === "muted") out.muted.push(d);
    const h = healthAt(d.id, now, DEMO_START);
    if (h.battery < 20) out.lowBattery.push(d);
    if (d.rssi < -110) out.weakSignal.push(d);
  }
  return out;
}

// ---- water ------------------------------------------------------------------------

const mainMeter = (b: BuildingProfile) => deviceById(`${b.id}/FT-01`)!.channels[0]!;

/** Litres through the main meter between two times, sampled every `stepMin`. */
export function volumeL(engine: Engine, b: BuildingProfile, from: UtcMs, to: UtcMs, stepMin = 5): number {
  const ch = mainMeter(b);
  let litres = 0;
  for (let t = from; t < to; t += stepMin * MINUTE) {
    const v = sample(ch, t, engine.world.effects);
    if (v !== null) litres += v * stepMin;
  }
  return litres;
}

/** Last 24 hours against the same 24 hours on the previous four same weekdays. */
const memo = new Map<string, unknown>();
function memoised<T>(key: string, f: () => T): T {
  if (memo.has(key)) return memo.get(key) as T;
  const v = f();
  if (memo.size > 5000) memo.clear();
  memo.set(key, v);
  return v;
}

export function water24h(engine: Engine, b: BuildingProfile, now: UtcMs): { litres: number; usual: number } {
  // five-minute buckets: the figure moves as readings arrive, without recomputing every second
  const bucket = Math.floor(now / (5 * MINUTE)) * 5 * MINUTE;
  return memoised(`w24|${b.id}|${bucket}|${engine.world.effects.revision}`, () => water24hAt(engine, b, bucket));
}

function water24hAt(engine: Engine, b: BuildingProfile, now: UtcMs): { litres: number; usual: number } {
  const litres = volumeL(engine, b, now - DAY, now);
  let usual = 0;
  for (let w = 1; w <= 4; w++) usual += volumeL(engine, b, now - DAY - w * 7 * DAY, now - w * 7 * DAY, 15);
  return { litres, usual: usual / 4 };
}

/**
 * The night's flow floor: the median of the six half-hour averages between
 * 01:00 and 04:00 local. A plain minimum would hide a leak that starts
 * partway through the window (decision D17).
 */
export function nightFlow(engine: Engine, b: BuildingProfile, nightOf: UtcMs): number | null {
  const p0 = localParts(nightOf, b.zone);
  return memoised(`night|${b.id}|${p0.year}-${p0.month}-${p0.day}|${engine.world.effects.revision}`, () => nightFlowAt(engine, b, nightOf));
}

function nightFlowAt(engine: Engine, b: BuildingProfile, nightOf: UtcMs): number | null {
  const p = localParts(nightOf, b.zone);
  const start = fromLocal(b.zone, p.year, p.month, p.day, 1, 0);
  const ch = mainMeter(b);
  const blocks: number[] = [];
  for (let k = 0; k < 6; k++) {
    let s = 0;
    let n = 0;
    for (let m = 0; m < 30; m++) {
      const v = sample(ch, start + (k * 30 + m) * MINUTE, engine.world.effects);
      if (v !== null) {
        s += v;
        n++;
      }
    }
    if (n >= 20) blocks.push(s / n);
  }
  if (blocks.length < 4) return null;
  blocks.sort((a, z) => a - z);
  const mid = blocks.length / 2;
  const med = blocks.length % 2 ? blocks[Math.floor(mid)]! : (blocks[mid - 1]! + blocks[mid]!) / 2;
  return Math.round(med * 10) / 10;
}

/** The most recent night whose 01:00 to 04:00 window has finished. */
export function lastCompletedNight(b: BuildingProfile, now: UtcMs): UtcMs {
  const p = localParts(now, b.zone);
  const todayFourAm = fromLocal(b.zone, p.year, p.month, p.day, 4, 0);
  return now >= todayFourAm ? todayFourAm - 2 * 3600_000 : todayFourAm - DAY - 2 * 3600_000;
}

/** Baseline from the 28 nights before `night`: median and the 10th to 90th percentile band. */
export function nightBaseline(engine: Engine, b: BuildingProfile, night: UtcMs, cache?: Map<number, number | null>) {
  const values: number[] = [];
  for (let k = 1; k <= 28; k++) {
    const t = night - k * DAY;
    const v = cache?.get(t) ?? nightFlow(engine, b, t);
    cache?.set(t, v);
    if (v !== null) values.push(v);
  }
  values.sort((a, z) => a - z);
  const q = (f: number) => values[Math.min(values.length - 1, Math.max(0, Math.round(f * (values.length - 1))))] ?? 0;
  return { median: q(0.5), p10: q(0.1), p90: q(0.9) };
}

// ---- portfolio ------------------------------------------------------------------

export interface BuildingRow {
  id: string;
  status: Status | "normal";
  annunciator: AnnunciatorState;
  openIncidents: number;
  devicesOnline: number;
  devicesTotal: number;
  devicesMuted: number;
  water24hL: number;
  water24hUsualL: number;
  nightFlowLpm: number | null;
  nightBaselineLpm: number;
  lastReadingAt: UtcMs | null;
  topIncidentId: string | null;
}

export function buildingRow(engine: Engine, b: BuildingProfile, now: UtcMs): BuildingRow {
  const open = engine.world.incidents.filter((i) => i.buildingId === b.id && i.state !== "resolved");
  const devs = devicesOf(b.id);
  let online = 0;
  let muted = 0;
  let last: UtcMs | null = null;
  const statuses: Array<Status | "normal"> = open.map((i) => i.severity);
  for (const d of devs) {
    const st = deviceState(engine, d, now);
    if (st === "online" || st === "muted") online++;
    if (st === "muted") muted++;
    if (st === "offline") statuses.push("offline");
    if (st === "muted") statuses.push("muted");
  }
  // last reading: the main meter uplinks every minute, so check it first
  for (const d of devs.slice(0, 6)) {
    const u = lastUplink(d.id, now, engine.world.effects, 2 * 3600_000);
    if (u !== null && (last === null || u > last)) last = u;
  }
  const w = water24h(engine, b, now);
  const night = lastCompletedNight(b, now);
  const top = [...open].sort((a, z) => STATUS_RANK[a.severity] - STATUS_RANK[z.severity] || Number(a.state !== "open") - Number(z.state !== "open"))[0];
  return {
    id: b.id,
    status: worstStatus(statuses),
    annunciator: annunciatorFor(engine, b.id, now),
    openIncidents: open.length,
    devicesOnline: online,
    devicesTotal: devs.length,
    devicesMuted: muted,
    water24hL: w.litres,
    water24hUsualL: w.usual,
    nightFlowLpm: nightFlow(engine, b, night),
    nightBaselineLpm: nightBaseline(engine, b, night).median,
    lastReadingAt: last,
    topIncidentId: top?.id ?? null,
  };
}

export interface Briefing {
  critical: Array<{ incidentId: string; buildingId: string; acknowledged: boolean; criticalForMs: number }>;
  warnings: number;
  warningsUnacknowledged: number;
  offline: number;
  muted: number;
  water24hL: number;
  water24hUsualL: number;
  weekday: string;
}

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function briefing(engine: Engine, rows: BuildingRow[], now: UtcMs, viewerZone: string): Briefing {
  const open = engine.world.incidents.filter((i) => i.state !== "resolved");
  const crit = open.filter((i) => i.severity === "critical");
  const warn = open.filter((i) => i.severity === "warning");
  const ex = fleetExceptions(engine, now);
  return {
    critical: crit.map((i) => ({ incidentId: i.id, buildingId: i.buildingId, acknowledged: i.state !== "open", criticalForMs: now - i.severitySince })),
    warnings: warn.length,
    warningsUnacknowledged: warn.filter((i) => i.state === "open").length,
    offline: ex.offline.length,
    muted: ex.muted.length,
    water24hL: rows.reduce((s, r) => s + r.water24hL, 0),
    water24hUsualL: rows.reduce((s, r) => s + r.water24hUsualL, 0),
    weekday: WEEKDAY[localParts(now, viewerZone).weekday]!,
  };
}

export function allBuildingRows(engine: Engine, now: UtcMs): BuildingRow[] {
  return BUILDINGS.map((b) => buildingRow(engine, b, now));
}

export { buildingById, topologyOf };
