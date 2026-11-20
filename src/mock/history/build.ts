/**
 * Builds the world as it stands at the demo start: effects (the physical
 * history), incidents, alerts, notifications and the Logbook. Deterministic:
 * every build is identical.
 */
import type { Alert, Incident, LogbookAction, LogbookEntry, Notification } from "@/domain/building";
import type { UtcMs } from "@/domain/common";
import type { Channel, Measure } from "@/domain/ingestion";
import { formatDuration, formatTime, formatValue, fromLocal, type Unit } from "@/lib/format";
import { buildingById } from "@/mock/world/buildings";
import { personName } from "@/mock/world/people";
import { criticalPolicy, ruleById, warningPolicy } from "@/mock/world/rules";
import { allDevices, deviceById, topologyOf } from "@/mock/world/topology";
import { type ContactState, runCriticalEscalation, warningNotice } from "@/mock/engine/escalation";
import { type Effect, EffectStore } from "@/mock/signals/effects";
import { COOL_ROOM_BASE, COOL_ROOM_DEFROST, sample } from "@/mock/signals/signals";
import { DEMO_START, FIRST_INCIDENT_NUMBER } from "@/mock/scenarios/clock";
import { HERO, PARKSIDE, WATTLE, WEXFORD } from "@/mock/scenarios/openAtStart";
import { buildRainwater, firstCrossingBelow } from "./rainwater";
import { HISTORY, type HistorySpec } from "./specs";

const M = 60_000;
const H = 60 * M;

/** Marcus Teo's mobile number went out of date on Mon 16 Nov. */
export const MARCUS_NUMBER_STALE_FROM = Date.UTC(2026, 10, 15, 13, 0);

export interface World {
  effects: EffectStore;
  incidents: Incident[];
  alerts: Alert[];
  notifications: Notification[];
  logbook: LogbookEntry[];
  contacts: ContactState;
  /** Sequence counters for records the engine adds live. */
  seq: { incident: number; alert: number; logbook: number };
}

const RULE_MEASURE: Record<string, Measure | null> = {
  "overnight-flow": "flow",
  burst: "flow",
  "low-pressure": "pressure",
  "tank-low": "level",
  "tank-high": "level",
  "pump-runtime": "duty",
  "cool-room": "temperature",
  "hot-water": "temperature",
  "door-open": "door",
  "leak-wet": "wet",
  "device-offline": null,
};

const MEASURE_UNIT: Partial<Record<Measure, Unit>> = {
  flow: "L/min",
  pressure: "kPa",
  level: "%",
  duty: "%",
  temperature: "°C",
};

function channelFor(deviceId: string, measure: Measure | null): Channel | null {
  if (!measure) return null;
  return deviceById(deviceId)?.channels.find((c) => c.measure === measure) ?? null;
}

/** Physical facts that are not incidents: offline devices, a stuck sensor, the Glenelg mute. */
function baseEffects(): Effect[] {
  const riverbendLastHeard = DEMO_START - (3 * 24 + 4) * H;
  const hayLastHeard = DEMO_START - (2 * H + 10 * M);
  const glenelg = (h: number) => fromLocal("Australia/Adelaide", 2026, 11, 20, h, 0);
  return [
    { kind: "gap", deviceIds: ["riverbend-plaza/FT-04"], reason: "Battery flat", from: riverbendLastHeard + 1, to: null },
    { kind: "gap", deviceIds: ["hay-street-exchange/PT-03"], reason: "Weak signal, uplinks not reaching the gateway", from: hayLastHeard + 1, to: null },
    {
      kind: "stuck",
      channelId: "lorne-road-medical/PT-02/pressure",
      value: 312,
      from: fromLocal("Australia/Sydney", 2026, 11, 11, 9, 0),
      to: fromLocal("Australia/Sydney", 2026, 11, 11, 15, 0),
    },
    {
      kind: "mute",
      deviceIds: ["WL-L1-01", "WL-L1-02", "WL-L1-03", "WL-L1-04"].map((t) => `glenelg-health-hub/${t}`),
      reason: "Plumbing works on Level 1",
      by: "ruth",
      from: glenelg(7),
      to: glenelg(11),
    },
  ];
}

interface Draft {
  spec: HistorySpec;
  openedAt: UtcMs;
  ackAt: UtcMs | null;
  dev: (tag: string) => string;
}

export function buildWorld(): World {
  // Cool room 2 at Wattle Grove defrosts at 06:00 local, which is how it went over 5 °C at 06:06.
  COOL_ROOM_DEFROST["wattle-grove/TT-06"] = 6;
  COOL_ROOM_BASE["wattle-grove/TT-06"] = 3.1;

  const effects = new EffectStore();
  for (const e of buildRainwater()) effects.add(e);
  for (const e of baseEffects()) effects.add(e);

  // ---- pass 1: times and physical effects -------------------------------------
  const drafts: Draft[] = [];
  for (const spec of [...HISTORY, HERO, PARKSIDE, WATTLE, WEXFORD]) {
    const b = buildingById.get(spec.buildingId)!;
    let openedAt = spec.openedAtUtc ?? fromLocal(b.zone, ...spec.at);
    let ackAt = spec.ackAtUtc ?? (spec.ack ? openedAt + spec.ack.afterMin * M : null);
    if (spec.key === PARKSIDE.key) {
      const crossing = firstCrossingBelow("parkside-secondary/LT-02", 40, DEMO_START - 14 * 24 * H, DEMO_START)!;
      openedAt = crossing + 15 * M;
      ackAt = fromLocal(b.zone, 2026, 11, 18, 8, 3);
    }
    const dev = (tag: string) => `${spec.buildingId}/${tag}`;
    for (const e of spec.effects(openedAt, dev)) effects.add(e);
    drafts.push({ spec, openedAt, ackAt, dev });
  }

  // Wexford: size the drop so Level 21 reads 142 kPa at 07:48.
  {
    const ch = channelFor("140-wexford-street/PT-04", "pressure")!;
    const before = sample(ch, DEMO_START, effects)!;
    const o = drafts.find((d) => d.spec.key === WEXFORD.key)!.openedAt;
    effects.add({
      kind: "pressure-offset",
      deviceIds: ["140-wexford-street/PT-04", "140-wexford-street/PT-05"],
      kpa: 142 - before,
      rampMin: 5,
      from: o - 5 * M,
      to: o + 27 * M,
    });
  }

  // Gaps for gateways and flat batteries become device offline and online entries.
  drafts.sort((a, b) => a.openedAt - b.openedAt);

  // ---- pass 2: records ----------------------------------------------------------
  const incidents: Incident[] = [];
  const alerts: Alert[] = [];
  const notifications: Notification[] = [];
  const log: Array<Omit<LogbookEntry, "id">> = [];
  let alertSeq = 0;

  drafts.forEach((d, i) => {
    const { spec, openedAt, ackAt } = d;
    const b = buildingById.get(spec.buildingId)!;
    const id = `I-2026-${String(FIRST_INCIDENT_NUMBER + i).padStart(4, "0")}`;
    const resolvedAt = spec.resolve ? openedAt + spec.resolve.afterMin * M : null;
    const criticalAt = spec.severity === "critical" ? openedAt : spec.criticalAfterMin !== undefined ? openedAt + spec.criticalAfterMin * M : null;
    const peak = criticalAt !== null && criticalAt <= DEMO_START ? "critical" : spec.severity;
    const isolatedAt = spec.isolate ? openedAt + spec.isolate.afterMin * M : null;
    const dispatchedAt = spec.dispatch ? openedAt + spec.dispatch.afterMin * M : null;
    const levelId = spec.level ? `${b.id}/${spec.level}` : null;
    const L = (at: UtcMs, actor: string, action: LogbookAction, detail: string, extra: Partial<LogbookEntry> = {}) =>
      log.push({ at, actor, action, buildingId: b.id, incidentId: id, deviceId: null, target: id, detail, ...extra });

    // alerts
    const alertIds: string[] = [];
    for (const a of spec.alerts) {
      const raisedAt = openedAt + a.afterMin * M;
      const rule = ruleById.get(a.rule)!;
      const deviceId = d.dev(a.device);
      const ch = channelFor(deviceId, RULE_MEASURE[a.rule] ?? null);
      const value = ch ? (sample(ch, raisedAt, effects) ?? 0) : rule.threshold;
      const alertId = `A-${String(++alertSeq).padStart(5, "0")}`;
      alertIds.push(alertId);
      const unit = ch ? MEASURE_UNIT[ch.measure] : undefined;
      alerts.push({
        id: alertId,
        ruleId: rule.id,
        incidentId: id,
        buildingId: b.id,
        deviceId,
        channelId: ch?.id ?? `${deviceId}/link`,
        severity: rule.severity,
        raisedAt,
        value,
        summary: a.summary,
        clearedAt: resolvedAt,
      });
      const reading = unit ? ` Reading ${formatValue(value, unit)}.` : "";
      L(raisedAt, "system", "alert-raised", `${a.summary}.${reading} ${deviceById(deviceId)?.location ?? ""}.`, {
        deviceId,
        target: a.device,
      });
      if (a.afterMin === 0) L(raisedAt, "system", "incident-opened", `Incident opened: ${spec.title}, ${spec.location}.`);
    }
    if (criticalAt !== null && spec.severity === "warning" && criticalAt <= DEMO_START) {
      L(criticalAt, "system", "severity-raised", "Severity raised to critical. Escalation started.");
    }

    // notifications
    const contacts: ContactState = { faultyMobiles: new Set(openedAt >= MARCUS_NUMBER_STALE_FROM ? ["marcus"] : []) };
    const summary = spec.alerts[spec.alerts.length - 1]!.summary;
    if (spec.severity === "warning") {
      const sent = warningNotice({ incidentId: id, buildingId: b.id, policy: warningPolicy(b.id), at: openedAt, summary: spec.alerts[0]!.summary, contacts });
      notifications.push(...sent);
      L(openedAt, "system", "notification", `Warning sent to ${personName(sent[0]!.personId)}. ${sent.map((n) => `${channelWord(n.channel)}: ${n.detail.toLowerCase()}`).join(". ")}.`);
    }
    if (criticalAt !== null && criticalAt <= DEMO_START) {
      const until = Math.min(DEMO_START, ackAt ?? Infinity, resolvedAt ?? Infinity);
      const run = runCriticalEscalation({
        incidentId: id,
        buildingId: b.id,
        policy: criticalPolicy(b.id),
        criticalSince: criticalAt,
        from: criticalAt,
        until,
        ackAt,
        summary,
        contacts,
      });
      notifications.push(...run.notifications);
      for (const s of run.steps) {
        L(s.at, "system", "notification", `Escalation step ${s.stepSeq}, ${personName(s.personId)}. ${s.notifications.map((n) => `${channelWord(n.channel)}: ${n.detail.toLowerCase()}`).join(". ")}.`);
      }
    }

    // people
    if (ackAt !== null && ackAt <= DEMO_START && spec.ack) {
      L(ackAt, spec.ack.by, "acknowledged", `Acknowledged after ${formatDuration(ackAt - openedAt)}.`);
    }
    if (spec.dispatch && dispatchedAt! <= DEMO_START) {
      L(dispatchedAt!, spec.dispatch.by, "dispatched", `Dispatched ${personName(spec.dispatch.to)}, ETA ${spec.dispatch.etaMin} min.`);
      L(dispatchedAt! + spec.dispatch.etaMin * M, spec.dispatch.to, "arrived", `On site at ${formatTime(dispatchedAt! + spec.dispatch.etaMin * M, b.zone)}.`);
    }
    if (spec.isolate && isolatedAt! <= DEMO_START) L(isolatedAt!, spec.isolate.by, "isolated", "Supply isolated. Flow back to normal.");
    for (const n of spec.notes ?? []) L((spec.key === PARKSIDE.key ? ackAt! : openedAt) + n.afterMin * M, n.by, "note", n.text);
    for (const p of spec.photos ?? []) L(openedAt + p.afterMin * M, p.by, "photo", p.caption);
    if (spec.resolve && resolvedAt! <= DEMO_START) {
      const r = spec.resolve;
      if (r.code === "false-alarm") L(resolvedAt!, r.by, "false-alarm", `Closed as false alarm. ${r.cause}. ${r.action}.`);
      else L(resolvedAt!, r.by, "resolved", `Resolved. Cause: ${r.cause}. Action: ${r.action}.`);
    }

    const state = resolvedAt !== null && resolvedAt <= DEMO_START ? "resolved" : ackAt !== null && ackAt <= DEMO_START ? "acknowledged" : "open";
    incidents.push({
      id,
      buildingId: b.id,
      category: spec.category,
      severity: state === "resolved" ? peak : criticalAt !== null && criticalAt <= DEMO_START ? "critical" : "warning",
      peakSeverity: peak,
      state,
      title: spec.title,
      location: spec.location,
      levelId,
      channel: ruleById.get(spec.alerts[spec.alerts.length - 1]!.rule)!.annunciator,
      openedAt,
      severitySince: criticalAt !== null && criticalAt <= DEMO_START ? criticalAt : openedAt,
      acknowledgedAt: ackAt !== null && ackAt <= DEMO_START ? ackAt : null,
      acknowledgedBy: ackAt !== null && ackAt <= DEMO_START ? (spec.ack?.by ?? null) : null,
      dispatchedAt: dispatchedAt !== null && dispatchedAt <= DEMO_START ? dispatchedAt : null,
      dispatchedTo: spec.dispatch && dispatchedAt! <= DEMO_START ? spec.dispatch.to : null,
      etaMin: spec.dispatch?.etaMin ?? null,
      isolatedAt: isolatedAt !== null && isolatedAt <= DEMO_START ? isolatedAt : null,
      resolvedAt: state === "resolved" ? resolvedAt : null,
      resolvedBy: state === "resolved" ? spec.resolve!.by : null,
      resolution: state === "resolved" ? spec.resolve!.code : null,
      cause: state === "resolved" ? spec.resolve!.cause : null,
      action: state === "resolved" ? spec.resolve!.action : null,
      assignee: spec.dispatch?.to ?? spec.ack?.by ?? null,
      alertIds,
      leak: spec.water
        ? {
            rateLpm: spec.water.rateLpm,
            from: openedAt + spec.water.fromMin * M,
            to: spec.water.toMin === null ? null : openedAt + spec.water.toMin * M,
            meterTag: spec.water.meter,
          }
        : null,
      notes: (spec.notes ?? [])
        .map((n) => ({ at: (spec.key === PARKSIDE.key ? ackAt! : openedAt) + n.afterMin * M, by: n.by, text: n.text }))
        .filter((n) => n.at <= DEMO_START),
      photos: (spec.photos ?? []).map((p) => ({ at: openedAt + p.afterMin * M, by: p.by, caption: p.caption })).filter((p) => p.at <= DEMO_START),
      damage: spec.damage ?? null,
    });
  });

  // ---- device events from gaps and mutes ----------------------------------------
  for (const e of effects.list()) {
    if (e.kind === "gap") {
      for (const deviceId of e.deviceIds) {
        const dv = deviceById(deviceId);
        if (!dv) continue;
        const what = dv.kind === "gateway" ? `Gateway ${dv.tag}` : `${dv.tag}`;
        const behind = dv.kind === "gateway" ? allDevices().filter((x) => x.gatewayId === dv.id).length : 0;
        const paused = behind ? ` Readings from ${behind} devices paused.` : "";
        log.push({ at: e.from, actor: "system", action: "device-offline", buildingId: dv.buildingId, incidentId: null, deviceId, target: dv.tag, detail: `${what} stopped reporting. ${e.reason}.${paused}` });
        if (e.to !== null && e.to <= DEMO_START) {
          log.push({ at: e.to, actor: "system", action: "device-online", buildingId: dv.buildingId, incidentId: null, deviceId, target: dv.tag, detail: `${what} reporting again after ${formatDuration(e.to - e.from)}.` });
        }
      }
    }
    if (e.kind === "mute" && e.from <= DEMO_START) {
      const first = deviceById(e.deviceIds[0]!)!;
      const tags = e.deviceIds.map((x) => deviceById(x)!.tag).join(", ");
      const b = buildingById.get(first.buildingId)!;
      log.push({
        at: e.from - 4 * M,
        actor: e.by,
        action: "muted",
        buildingId: b.id,
        incidentId: null,
        deviceId: null,
        target: tags,
        detail: `Muted ${e.deviceIds.length} devices from ${formatTime(e.from, b.zone)} to ${e.to ? formatTime(e.to, b.zone) : "further notice"}. Reason: ${e.reason}.`,
      });
    }
  }

  log.sort((a, b) => a.at - b.at);
  const logbook: LogbookEntry[] = log.map((e, i) => ({ id: `L-${String(i + 1).padStart(6, "0")}`, ...e }));

  return {
    effects,
    incidents,
    alerts,
    notifications: notifications.sort((a, b) => a.at - b.at),
    logbook,
    contacts: { faultyMobiles: new Set(["marcus"]) },
    seq: { incident: FIRST_INCIDENT_NUMBER + drafts.length, alert: alertSeq, logbook: logbook.length },
  };
}

function channelWord(c: Notification["channel"]): string {
  return c === "sms" ? "SMS" : c === "push" ? "Push" : "Email";
}

/** Levels of a building, for tests and selectors. */
export const levelsOf = (buildingId: string) => topologyOf(buildingId).levels;
