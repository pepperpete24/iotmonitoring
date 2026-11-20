/** Building, device and time-series responses. */
import type { BuildingDetail, BuildingSummary, DeviceLive, SeriesView } from "@/api/types";
import { BUILDING_TYPE_LABEL, type UtcMs } from "@/domain/common";
import { type Device, DEVICE_KIND_LABEL, MEASURE_UNIT } from "@/domain/ingestion";
import { formatNumber } from "@/lib/format";
import { type Engine, isolationOf } from "@/mock/engine/engine";
import { active } from "@/mock/signals/effects";
import { sample } from "@/mock/signals/signals";
import { lastReading } from "@/mock/signals/uplinks";
import { buildingRow, type BuildingRow, deviceHealth, deviceState, devicesOf } from "@/mock/selectors/compute";
import { buildingById, type BuildingProfile } from "@/mock/world/buildings";
import { personById } from "@/mock/world/people";
import { ROSTER } from "@/mock/world/rules";
import { deviceById, FIRMWARE_LATEST, topologyOf } from "@/mock/world/topology";
import { incidentSummary } from "./views";

export function deviceLive(engine: Engine, d: Device, now: UtcMs): DeviceLive {
  const status = deviceState(engine, d, now);
  const h = deviceHealth(engine, d, now);
  const fx = engine.world.effects;
  let muteReason: string | null = null;
  let muteUntil: UtcMs | null = null;
  for (const e of fx.forDevice(d.id)) {
    if (e.kind === "mute" && active(e, now)) {
      muteReason = e.reason;
      muteUntil = e.to;
    }
  }
  const open = engine.world.alerts.filter((a) => a.deviceId === d.id && a.raisedAt <= now && (a.clearedAt === null || a.clearedAt > now));
  const alert = open.some((a) => a.severity === "critical") ? "critical" : open.length ? "warning" : null;
  const openIncident = open
    .map((a) => engine.world.incidents.find((i) => i.id === a.incidentId))
    .find((i) => i && i.state !== "resolved");
  return {
    id: d.id,
    tag: d.tag,
    kind: d.kind,
    kindLabel: DEVICE_KIND_LABEL[d.kind],
    model: d.model,
    location: d.location,
    buildingId: d.buildingId,
    levelId: d.levelId,
    systemId: d.systemId,
    equipmentId: d.equipmentId,
    status,
    muteReason,
    muteUntil,
    alert,
    openIncidentId: openIncident?.id ?? null,
    readings: d.channels
      .map((c) => {
        const r = lastReading(c, now, fx);
        return r ? { measure: c.measure, value: r.value, unit: MEASURE_UNIT[c.measure], at: r.t } : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null),
    lastUplink: h.lastUplink,
    battery: h.battery,
    rssi: h.rssi,
    snr: h.snr,
    link: d.link,
    gatewayTag: d.gatewayId ? d.gatewayId.split("/")[1]! : null,
    firmware: d.firmware,
    firmwareLatest: d.firmware === FIRMWARE_LATEST[d.kind],
    devEui: d.devEui,
  };
}

export function summaryOf(b: BuildingProfile, r: BuildingRow): BuildingSummary {
  return {
    id: b.id,
    name: b.name,
    shortName: b.shortName,
    address: b.address,
    suburb: b.suburb,
    state: b.state,
    zone: b.zone,
    type: b.type,
    lat: b.lat,
    lon: b.lon,
    status: r.status,
    annunciator: r.annunciator,
    openIncidents: r.openIncidents,
    topIncidentId: r.topIncidentId,
    devicesOnline: r.devicesOnline,
    devicesTotal: r.devicesTotal,
    devicesMuted: r.devicesMuted,
    water24hL: r.water24hL,
    water24hUsualL: r.water24hUsualL,
    nightFlowLpm: r.nightFlowLpm,
    nightBaselineLpm: r.nightBaselineLpm,
    lastReadingAt: r.lastReadingAt,
  };
}

function occupancyLabel(b: BuildingProfile): string {
  const o = b.occupancy;
  if (o.kind === "m2") return `${formatNumber(o.count)} m² lettable`;
  return `${formatNumber(o.count)} ${o.kind}${o.extra ? `, ${o.extra}` : ""}`;
}

export function buildingDetail(engine: Engine, id: string, now: UtcMs): BuildingDetail | null {
  const b = buildingById.get(id);
  if (!b) return null;
  const topo = topologyOf(id);
  const summary = summaryOf(b, buildingRow(engine, b, now));
  const open = engine.world.incidents.filter((i) => i.buildingId === id && i.state !== "resolved");
  // The drawing marks a water fault from the meter that measures it to where it is.
  const waterInc =
    open.find((i) => i.leak && i.leak.to === null) ?? open.find((i) => i.category === "burst" || i.category === "leak-minor" || i.category === "leak-false-alarm");
  let waterFault: BuildingDetail["waterFault"] = null;
  if (waterInc && waterInc.levelId) {
    const meter = waterInc.leak ? deviceById(`${id}/${waterInc.leak.meterTag}`) : null;
    const wet = waterInc.alertIds.map((x) => engine.world.alerts.find((a) => a.id === x)!).find((a) => a.ruleId === "leak-wet");
    const faultDevice = wet ? deviceById(wet.deviceId) : null;
    waterFault = {
      incidentId: waterInc.id,
      severity: waterInc.severity,
      meterLevelId: meter?.levelId ?? waterInc.levelId,
      faultLevelId: faultDevice?.levelId ?? waterInc.levelId,
      systemId: faultDevice?.systemId ?? null,
    };
  }
  const roster = ROSTER[id] ?? [];
  return {
    summary,
    typeLabel: BUILDING_TYPE_LABEL[b.type],
    levelsAbove: b.levels,
    basements: b.basements,
    campusBuildings: b.campusBuildings ?? null,
    occupancy: occupancyLabel(b),
    contacts: roster
      .map((p) => personById.get(p)!)
      .map((p) => ({ name: p.name, title: p.title, mobileMasked: engine.contactOverrides.get(p.id) ?? p.mobileMasked, email: p.email })),
    roster: roster.map((p) => personById.get(p)?.name ?? p),
    levels: topo.levels.map((l) => ({ id: l.id, label: l.label, short: l.short, heightM: l.heightM, order: l.order })),
    systems: topo.systems.map((s) => ({ id: s.id, name: s.name, type: s.type, servesFrom: s.servesFrom, servesTo: s.servesTo, lane: s.lane })),
    equipment: topo.equipment.map((e) => ({ id: e.id, tag: e.tag, name: e.name, kind: e.kind, levelId: e.levelId, systemId: e.systemId })),
    devices: devicesOf(id).map((d) => deviceLive(engine, d, now)),
    incidents: engine.world.incidents
      .filter((i) => i.buildingId === id)
      .sort((a, z) => z.openedAt - a.openedAt)
      .map((i) => incidentSummary(engine, i, now)),
    valve: b.hasShutoffValve ? { tag: "XV-01", closed: engine.valveClosed(id, "XV-01", now), isolation: isolationOf(id).sentence } : null,
    waterFault,
  };
}

/** Downsampled readings: bucket means (max for wet, door and valve), null where the device was silent. */
export function series(engine: Engine, channelId: string, from: UtcMs, to: UtcMs, points: number): SeriesView | null {
  const deviceId = channelId.split("/").slice(0, 2).join("/");
  const d = deviceById(deviceId);
  const c = d?.channels.find((x) => x.id === channelId);
  if (!d || !c) return null;
  const fx = engine.world.effects;
  const binary = c.measure === "wet" || c.measure === "door" || c.measure === "valve";
  const interval = binary ? 60_000 : c.intervalS * 1000;
  const target = Math.max(10, Math.min(800, points));
  const step = Math.max(interval, Math.ceil((to - from) / target / interval) * interval);
  const subs = Math.max(1, Math.min(6, Math.floor(step / interval)));
  const out: Array<[UtcMs, number | null]> = [];
  for (let t = Math.floor(from / step) * step; t < to; t += step) {
    let sum = 0;
    let n = 0;
    let max = -Infinity;
    for (let k = 0; k < subs; k++) {
      const v = sample(c, t + Math.floor((k * step) / subs), fx);
      if (v === null) continue;
      sum += v;
      n++;
      max = Math.max(max, v);
    }
    out.push([t, n ? (binary ? max : Math.round((sum / n) * 10) / 10) : null]);
  }
  const gaps: SeriesView["gaps"] = [];
  for (const id of [d.id, ...(d.gatewayId ? [d.gatewayId] : [])]) {
    for (const e of fx.forDevice(id)) {
      if (e.kind !== "gap") continue;
      const end = e.to ?? engine.now;
      if (e.from < to && end > from) gaps.push({ from: Math.max(from, e.from), to: Math.min(to, end), reason: e.reason });
    }
  }
  return { channelId, measure: c.measure, unit: MEASURE_UNIT[c.measure], from, to, stepMs: step, points: out, gaps };
}
