/** Maps the engine's world to the API's response shapes. */
import type {
  AlertView,
  BuildingSummary,
  DeviceRef,
  IncidentDetail,
  IncidentSummary,
  LogbookView,
  NotificationView,
  PortfolioStatus,
} from "@/api/types";
import type { Incident, LogbookEntry, Notification } from "@/domain/building";
import type { UtcMs } from "@/domain/common";
import { formatAgo, formatDuration } from "@/lib/format";
import type { Engine } from "@/mock/engine/engine";
import { isolationOf } from "@/mock/engine/engine";
import { sample } from "@/mock/signals/signals";
import { lastUplink } from "@/mock/signals/uplinks";
import {
  allBuildingRows,
  briefing,
  costAUD,
  dailyLossL,
  escalationSummary,
  fleetExceptions,
  waterLostL,
} from "@/mock/selectors/compute";
import { BUILDINGS, buildingById, ORGANISATION } from "@/mock/world/buildings";
import { personName } from "@/mock/world/people";
import { ruleById } from "@/mock/world/rules";
import { deviceById, topologyOf } from "@/mock/world/topology";

const UNIT: Record<string, string> = { flow: "L/min", pressure: "kPa", level: "%", duty: "%", temperature: "°C" };

export function organisation(engine: Engine) {
  return {
    id: ORGANISATION.id,
    name: ORGANISATION.name,
    shortName: ORGANISATION.shortName,
    viewerZone: ORGANISATION.viewerZone,
    tariffPerKL: engine.tariffPerKL,
  };
}

export function incidentSummary(engine: Engine, i: Incident, now: UtcMs): IncidentSummary {
  const b = buildingById.get(i.buildingId)!;
  const level = i.levelId ? topologyOf(b.id).levels.find((l) => l.id === i.levelId) : null;
  const water = waterLostL(i, now);
  return {
    id: i.id,
    buildingId: b.id,
    buildingName: b.name,
    zone: b.zone,
    category: i.category,
    severity: i.severity,
    peakSeverity: i.peakSeverity,
    state: i.state,
    title: i.title,
    location: i.location,
    levelLabel: level?.label ?? null,
    channel: i.channel,
    openedAt: i.openedAt,
    severitySince: i.severitySince,
    acknowledgedAt: i.acknowledgedAt,
    acknowledgedBy: i.acknowledgedBy ? personName(i.acknowledgedBy) : null,
    assignee: i.assignee ? personName(i.assignee) : null,
    alertCount: i.alertIds.length,
    resolvedAt: i.resolvedAt,
    resolution: i.resolution,
    waterLostL: water,
    costAUD: costAUD(water, engine.tariffPerKL),
  };
}

export function logbookView(e: LogbookEntry): LogbookView {
  const b = e.buildingId ? buildingById.get(e.buildingId) : null;
  return {
    id: e.id,
    at: e.at,
    actor: personName(e.actor),
    actorId: e.actor,
    action: e.action,
    buildingId: e.buildingId,
    buildingName: b?.name ?? null,
    zone: b?.zone ?? null,
    incidentId: e.incidentId,
    deviceId: e.deviceId,
    target: e.target,
    detail: e.detail,
  };
}

function notificationView(n: Notification): NotificationView {
  return {
    id: n.id,
    at: n.at,
    stepSeq: n.stepSeq,
    cycle: n.cycle,
    person: personName(n.personId),
    personId: n.personId,
    channel: n.channel,
    result: n.result,
    detail: n.detail,
    body: n.body,
  };
}

export function incidentDetail(engine: Engine, i: Incident, now: UtcMs): IncidentDetail {
  const b = buildingById.get(i.buildingId)!;
  const alerts: AlertView[] = i.alertIds.map((id) => {
    const a = engine.world.alerts.find((x) => x.id === id)!;
    const d = deviceById(a.deviceId)!;
    const measure = a.channelId.split("/").pop() ?? "";
    return {
      id: a.id,
      ruleName: ruleById.get(a.ruleId)!.name,
      severity: a.severity,
      deviceId: d.id,
      deviceTag: d.tag,
      location: d.location,
      summary: a.summary,
      raisedAt: a.raisedAt,
      value: a.value,
      unit: UNIT[measure] ?? null,
      clearedAt: a.clearedAt !== null && a.clearedAt <= now ? a.clearedAt : null,
    };
  });
  const daily = dailyLossL(i);
  const hasValve = b.hasShutoffValve;
  const wetSensors = alerts
    .filter((a) => a.ruleName === ruleById.get("leak-wet")!.name)
    .map((a) => deviceById(a.deviceId)!)
    .filter((d) => sample(d.channels[0]!, now, engine.world.effects) === 1)
    .map((d) => d.tag);
  return {
    ...incidentSummary(engine, i, now),
    alerts,
    notifications: engine.world.notifications.filter((n) => n.incidentId === i.id && n.at <= now + 30_000).map(notificationView),
    escalation: escalationSummary(i, engine.world.notifications),
    timeline: engine.world.logbook.filter((l) => l.incidentId === i.id && l.at <= now).map(logbookView),
    leak: i.leak,
    dailyLossL: daily,
    dailyCostAUD: costAUD(daily, engine.tariffPerKL),
    tariffPerKL: engine.tariffPerKL,
    dispatchedTo: i.dispatchedTo ? personName(i.dispatchedTo) : null,
    dispatchedAt: i.dispatchedAt,
    etaMin: i.etaMin,
    isolatedAt: i.isolatedAt,
    resolvedBy: i.resolvedBy ? personName(i.resolvedBy) : null,
    cause: i.cause,
    action: i.action,
    notes: i.notes.map((n) => ({ ...n, by: personName(n.by) })),
    photos: i.photos.map((p) => ({ ...p, by: personName(p.by) })),
    damage: i.damage,
    valve: hasValve ? { tag: "XV-01", closed: engine.valveClosed(b.id, "XV-01", now), isolation: isolationOf(b.id).sentence } : null,
    wetSensors,
  };
}

export function portfolioStatus(engine: Engine, now: UtcMs): PortfolioStatus {
  const rows = allBuildingRows(engine, now);
  const buildings: BuildingSummary[] = rows.map((r) => {
    const b = buildingById.get(r.id)!;
    return {
      id: b.id,
      name: b.name,
      shortName: b.shortName,
      address: b.address,
      suburb: b.suburb,
      state: b.state,
      zone: b.zone,
      type: b.type,
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
  });
  const ex = fleetExceptions(engine, now);
  const reason = (id: string) => {
    for (const e of engine.world.effects.forDevice(id)) {
      if (e.kind === "gap" && (e.to === null || e.to > now) && e.from <= now) return e.reason;
      if (e.kind === "mute" && (e.to === null || e.to > now) && e.from <= now) return e.reason;
    }
    return "";
  };
  const deviceExceptions: DeviceRef[] = [
    ...ex.offline.map((d) => {
      const last = lastUplink(d.id, now, engine.world.effects, 8 * 86_400_000);
      return { id: d.id, tag: d.tag, buildingId: d.buildingId, location: d.location, status: "offline" as const, detail: `${reason(d.id)}. Last heard ${last ? formatAgo(now - last) : "over a week ago"}` };
    }),
    ...ex.paused.map((d) => ({ id: d.id, tag: d.tag, buildingId: d.buildingId, location: d.location, status: "paused" as const, detail: "Gateway offline, readings paused" })),
    ...ex.muted.map((d) => ({ id: d.id, tag: d.tag, buildingId: d.buildingId, location: d.location, status: "muted" as const, detail: reason(d.id) })),
  ];
  return {
    organisation: organisation(engine),
    asOf: now,
    briefing: briefing(engine, rows, now, ORGANISATION.viewerZone),
    buildings,
    openIncidents: engine.world.incidents.filter((i) => i.state !== "resolved").map((i) => incidentSummary(engine, i, now)),
    deviceExceptions,
  };
}

export { BUILDINGS, formatDuration };
