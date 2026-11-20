/**
 * The live engine. Advances simulated time, evaluates rules, raises and
 * groups alerts into incidents, runs escalation, applies people's actions
 * and the demo triggers, and writes the Logbook. It talks to the UI only
 * through the mock API and the event bus, as a real backend would.
 *
 * Determinism: the world at any time is the build at 07:48 plus the
 * commands applied since, so a reload replays the session exactly.
 */
import type { Alert, Incident, LogbookAction, LogbookEntry, Notification, ResolutionCode } from "@/domain/building";
import type { UtcMs } from "@/domain/common";
import { formatDuration, formatTime, formatTimeZoned, formatValue, fromLocal, type Unit } from "@/lib/format";
import { buildWorld, type World } from "@/mock/history/build";
import { DEMO_START } from "@/mock/scenarios/clock";
import { type Effect, active } from "@/mock/signals/effects";
import { sample } from "@/mock/signals/signals";
import { buildingById } from "@/mock/world/buildings";
import { personName } from "@/mock/world/people";
import { criticalPolicy, ROSTER, warningPolicy } from "@/mock/world/rules";

const ROSTER_FIRST = (buildingId: string) => ROSTER[buildingId]?.[0] ?? "helen";
import { addDevice, allDevices, deviceById, makeDevice, removeAddedDevices, topologyOf } from "@/mock/world/topology";
import { DEVICE_KIND_LABEL, type DeviceKind } from "@/domain/ingestion";
import { runCriticalEscalation, testMessage, warningNotice } from "./escalation";
import { buildWatches, conditionAt, type Watch } from "./rules";

const M = 60_000;
const STEP = M; // rules are evaluated once per simulated minute

export type Command =
  | { type: "acknowledge"; incidentId: string; by: string }
  | { type: "assign"; incidentId: string; to: string; by: string }
  | { type: "dispatch"; incidentId: string; to: string; etaMin: number; by: string }
  | { type: "escalate-now"; incidentId: string; by: string }
  | { type: "close-valve"; buildingId: string; valveTag: string; incidentId: string | null; by: string }
  | { type: "open-valve"; buildingId: string; valveTag: string; by: string }
  | { type: "false-alarm"; incidentId: string; cause: string; by: string }
  | { type: "resolve"; incidentId: string; cause: string; action: string; by: string }
  | { type: "note"; incidentId: string; text: string; by: string }
  | { type: "photo"; incidentId: string; caption: string; by: string }
  | { type: "on-my-way"; incidentId: string; etaMin: number; by: string }
  | { type: "cannot-attend"; incidentId: string; by: string }
  | { type: "mute"; deviceIds: string[]; until: UtcMs; reason: string; by: string }
  | { type: "unmute"; deviceIds: string[]; by: string }
  | { type: "update-contact"; personId: string; mobileMasked: string; by: string }
  | { type: "test-message"; personId: string; by: string }
  | { type: "set-tariff"; perKL: number; by: string }
  | { type: "rename-device"; deviceId: string; name: string; by: string }
  | { type: "move-device"; deviceId: string; location: string; by: string }
  | { type: "replace-device"; deviceId: string; reason: string; by: string }
  | { type: "test-alert"; deviceId: string; by: string }
  | { type: "commission-device"; buildingId: string; tag: string; kind: DeviceKind; levelId: string; systemId: string | null; location: string; devEui: string; photo: string | null; by: string }
  | { type: "trigger"; scenario: "burst" | "door" | "gateway" | "leak-false-alarm"; by: string };

export interface StampedCommand {
  at: UtcMs;
  cmd: Command;
}

export class CommandError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Things that happen on their own at a set time: deliveries, arrivals, drying out. */
interface Scheduled {
  at: UtcMs;
  run: () => void;
  key: string;
}

type Listener = (kinds: Set<string>) => void;

export class Engine {
  world!: World;
  now: UtcMs = DEMO_START;
  tariffPerKL = 3.5;
  contactOverrides = new Map<string, string>();
  /** Changes people make to devices: a name, a new location, a replacement. */
  deviceOverrides = new Map<string, { name?: string; location?: string; devEui?: string; replacedAt?: UtcMs }>();
  private watches: Watch[] = [];
  private state = new Map<string, { since: UtcMs | null; alertId: string | null }>();
  private scheduled: Scheduled[] = [];
  private listeners = new Set<Listener>();
  private pending = new Set<string>();
  readonly commands: StampedCommand[] = [];
  revision = 0;

  constructor() {
    this.reset();
  }

  // ---- lifecycle ---------------------------------------------------------------

  /** Devices commissioned during this session, removed again on reset. */
  private addedDevices: string[] = [];

  reset() {
    removeAddedDevices(this.addedDevices ?? []);
    this.addedDevices = [];
    this.world = buildWorld();
    this.now = DEMO_START;
    this.tariffPerKL = 3.5;
    this.contactOverrides.clear();
    this.deviceOverrides.clear();
    this.commands.length = 0;
    this.scheduled = [];
    this.escalatedThrough = new Map();
    // the build ran every escalation step up to 07:48
    for (const inc of this.world.incidents) if (inc.state === "open" && inc.severity === "critical") this.escalatedThrough.set(inc.id, this.now);
    this.watches = buildWatches();
    this.state.clear();
    this.seedRuleState();
    this.scheduleStartScript();
    this.emit("reset");
  }

  /** Link open alerts at the start to their watches, so they are not raised twice. */
  private seedRuleState() {
    const openAlerts = this.world.alerts.filter((a) => a.clearedAt === null || a.clearedAt > this.now);
    for (const w of this.watches) {
      const alert = openAlerts.find((a) => a.deviceId === w.device.id && a.ruleId === w.rule.id);
      const c = conditionAt(w, this.now, this.world.effects, !!alert);
      this.state.set(w.key, { since: c?.holds ? this.now : null, alertId: alert && this.incidentOf(alert)?.state !== "resolved" ? alert.id : null });
    }
  }

  /** Scripted events after 07:48 that make the start state play out. */
  private scheduleStartScript() {
    const wattle = buildingById.get("wattle-grove")!;
    const wattleIncident = this.world.incidents.find((i) => i.buildingId === "wattle-grove" && i.state !== "resolved");
    const doorClosedAt = fromLocal(wattle.zone, 2026, 11, 20, 7, 5);
    this.at(doorClosedAt, "wattle-door", () => {
      const door = this.world.effects.list().find((e) => e.kind === "door-open" && e.doorId === "wattle-grove/DC-02" && e.to === null);
      if (door) this.world.effects.end(door, this.now);
      this.log("sandra", "note", { buildingId: wattle.id, incidentId: wattleIncident?.id ?? null, target: "DC-02", detail: "Cool room 2 door closed. Stock probed at 6.9 °C; moved high-risk items to cool room 1." });
    });
    if (wattleIncident) {
      this.at(fromLocal(wattle.zone, 2026, 11, 20, 7, 40), "wattle-resolve", () => {
        if (wattleIncident.state === "resolved") return;
        this.applyResolve(wattleIncident, "fixed", "Door left ajar after the morning delivery", "Door closed, stock checked. Delivery staff reminded to latch the door", "sandra");
      });
    }
    // Glenelg maintenance mute ends at 11:00 ACDT
    for (const e of this.world.effects.list()) {
      if (e.kind === "mute" && e.to !== null && e.to > this.now) {
        const mute = e;
        this.at(mute.to!, `unmute-${mute.from}`, () => {
          const first = deviceById(mute.deviceIds[0]!)!;
          this.log("system", "unmuted", { buildingId: first.buildingId, target: mute.deviceIds.map((x) => deviceById(x)!.tag).join(", "), detail: `Maintenance mute ended. ${mute.deviceIds.length} devices alerting again.` });
        });
      }
    }
  }

  private at(at: UtcMs, key: string, run: () => void) {
    this.scheduled.push({ at, key, run });
    this.scheduled.sort((a, b) => a.at - b.at);
  }

  // ---- events -----------------------------------------------------------------

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(kind: string) {
    this.pending.add(kind);
  }

  private flush() {
    if (!this.pending.size) return;
    const kinds = new Set(this.pending);
    this.pending.clear();
    this.revision++;
    for (const fn of this.listeners) fn(kinds);
  }

  // ---- time -----------------------------------------------------------------------

  /** Advance simulated time to `t`, one minute at a time. */
  advanceTo(t: UtcMs) {
    if (t <= this.now) return;
    while (this.now < t) {
      const next = Math.min(t, Math.floor(this.now / STEP) * STEP + STEP);
      this.now = next;
      this.runScheduled();
      if (next % STEP === 0) this.evaluate();
      this.escalate();
    }
    this.emit("tick");
    this.flush();
  }

  private runScheduled() {
    while (this.scheduled.length && this.scheduled[0]!.at <= this.now) {
      this.scheduled.shift()!.run();
    }
  }

  // ---- rules ----------------------------------------------------------------------

  private muted(deviceId: string, t: UtcMs): boolean {
    for (const e of this.world.effects.forDevice(deviceId)) if (e.kind === "mute" && active(e, t)) return true;
    return false;
  }

  private evaluate() {
    for (const w of this.watches) {
      const st = this.state.get(w.key)!;
      const c = conditionAt(w, this.now, this.world.effects, st.alertId !== null);
      if (!c) continue;
      if (c.holds) {
        if (st.since === null) st.since = this.now;
        if (st.alertId === null && this.now - st.since >= w.rule.minDurationMin * M && !this.muted(w.device.id, this.now)) {
          st.alertId = this.raise(w, c.value).id;
        }
      } else {
        st.since = null;
        if (st.alertId) {
          const a = this.world.alerts.find((x) => x.id === st.alertId);
          if (a && a.clearedAt === null) {
            a.clearedAt = this.now;
            const inc = this.incidentOf(a);
            this.log("system", "alert-cleared", {
              buildingId: a.buildingId,
              incidentId: a.incidentId,
              deviceId: a.deviceId,
              target: deviceById(a.deviceId)?.tag ?? "",
              detail: `${a.summary.replace(/ for \d+ min$/, "")}: cleared after ${formatDuration(this.now - a.raisedAt)}.${inc && inc.state !== "resolved" ? " The incident stays open until someone resolves it." : ""}`,
            });
            this.emit("alerts");
          }
          st.alertId = null;
        }
      }
    }
  }

  private raise(w: Watch, value: number): Alert {
    const b = buildingById.get(w.device.buildingId)!;
    const r = w.rule;
    const id = `A-${String(++this.world.seq.alert).padStart(5, "0")}`;
    const summary = alertSummary(w, value);
    // Group into an open incident at the same building opened in the last 6 hours.
    let incident = this.world.incidents.find((i) => i.buildingId === b.id && i.state !== "resolved" && this.now - i.openedAt < 6 * 60 * M);
    const alert: Alert = {
      id,
      ruleId: r.id,
      incidentId: "",
      buildingId: b.id,
      deviceId: w.device.id,
      channelId: w.channel?.id ?? `${w.device.id}/link`,
      severity: r.severity,
      raisedAt: this.now,
      value,
      summary,
      clearedAt: null,
    };
    const unit = UNIT[w.channel?.measure ?? ""];
    const raisedEntry = this.log("system", "alert-raised", {
      buildingId: b.id,
      deviceId: w.device.id,
      target: w.device.tag,
      detail: `${summary}.${unit ? ` Reading ${formatValue(value, unit)}.` : ""} ${w.device.location}.`,
    });
    if (!incident) {
      incident = this.openIncident(w, alert);
    } else {
      alert.incidentId = incident.id;
      incident.alertIds.push(id);
      if (r.severity === "critical" && incident.severity !== "critical") {
        incident.severity = "critical";
        incident.peakSeverity = "critical";
        incident.severitySince = this.now;
        incident.title = titleFor(w);
        incident.location = w.device.location;
        incident.channel = r.annunciator;
        this.log("system", "severity-raised", { buildingId: b.id, incidentId: incident.id, target: incident.id, detail: "Severity raised to critical. Escalation started." });
      }
    }
    alert.incidentId = incident.id;
    raisedEntry.incidentId = incident.id;
    this.world.alerts.push(alert);
    this.emit("alerts");
    this.emit("incidents");
    return alert;
  }

  private openIncident(w: Watch, alert: Alert): Incident {
    const b = buildingById.get(w.device.buildingId)!;
    const id = `I-2026-${String(this.world.seq.incident++).padStart(4, "0")}`;
    const level = topologyOf(b.id).levels.find((l) => l.id === w.device.levelId);
    const inc: Incident = {
      id,
      buildingId: b.id,
      category: categoryFor(w),
      severity: w.rule.severity,
      peakSeverity: w.rule.severity,
      state: "open",
      title: titleFor(w),
      location: w.device.location,
      levelId: level?.id ?? null,
      channel: w.rule.annunciator,
      openedAt: this.now,
      severitySince: this.now,
      acknowledgedAt: null,
      acknowledgedBy: null,
      dispatchedAt: null,
      dispatchedTo: null,
      etaMin: null,
      isolatedAt: null,
      resolvedAt: null,
      resolvedBy: null,
      resolution: null,
      cause: null,
      action: null,
      assignee: null,
      alertIds: [alert.id],
      leak: null,
      notes: [],
      photos: [],
      damage: null,
    };
    // a burst carries a measured leak rate from the meter
    if (w.rule.template === "burst") {
      const leakEffect = this.world.effects.forBuilding(b.id).find((e) => e.kind === "leak" && e.to === null && e.meterTags.includes(w.device.tag));
      if (leakEffect && leakEffect.kind === "leak") inc.leak = { rateLpm: leakEffect.rateLpm, from: leakEffect.from, to: null, meterTag: w.device.tag };
    }
    this.world.incidents.push(inc);
    this.log("system", "incident-opened", { buildingId: b.id, incidentId: id, target: id, detail: `Incident opened: ${inc.title}, ${inc.location}.` });
    if (inc.severity === "warning") {
      const sent = warningNotice({ incidentId: id, buildingId: b.id, policy: warningPolicy(b.id), at: this.now, summary: alert.summary, contacts: this.world.contacts });
      this.pushNotifications(sent, `Warning sent to ${personName(sent[0]!.personId)}.`, inc);
    }
    return inc;
  }

  // ---- escalation ------------------------------------------------------------------

  /** Escalation has been run up to and including this time, per incident. */
  private escalatedThrough = new Map<string, UtcMs>();

  private escalate() {
    for (const inc of this.world.incidents) {
      if (inc.state !== "open" || inc.severity !== "critical") continue;
      const through = this.escalatedThrough.get(inc.id) ?? inc.severitySince - 1;
      if (through >= this.now) continue;
      this.escalatedThrough.set(inc.id, this.now);
      const run = runCriticalEscalation({
        incidentId: inc.id,
        buildingId: inc.buildingId,
        policy: criticalPolicy(inc.buildingId),
        criticalSince: inc.severitySince,
        from: through + 1,
        until: this.now,
        ackAt: null,
        summary: this.world.alerts.find((a) => a.id === inc.alertIds[inc.alertIds.length - 1])?.summary ?? inc.title,
        contacts: this.world.contacts,
      });
      for (const s of run.steps) {
        this.pushNotifications(s.notifications, `Escalation step ${s.stepSeq}, ${personName(s.personId)}.`, inc, s.at);
      }
    }
  }

  private pushNotifications(ns: Notification[], lead: string, inc: Incident, at = this.now) {
    if (!ns.length) return;
    this.world.notifications.push(...ns);
    const words = ns.map((n) => `${n.channel === "sms" ? "SMS" : n.channel === "push" ? "Push" : "Email"}: ${lowerFirst(n.detail)}`).join(". ");
    this.log("system", "notification", { buildingId: inc.buildingId, incidentId: inc.id, target: inc.id, detail: `${lead} ${words}.`, at });
    this.emit("notifications");
  }

  // ---- commands ---------------------------------------------------------------------

  /** Apply a person's action at the current simulated time. Throws CommandError on refusal. */
  apply(cmd: Command, record = true) {
    switch (cmd.type) {
      case "acknowledge": {
        const inc = this.mustIncident(cmd.incidentId);
        if (inc.state !== "open") throw new CommandError(409, `${inc.id} was already acknowledged${inc.acknowledgedBy ? ` by ${personName(inc.acknowledgedBy)}` : ""}.`);
        inc.state = "acknowledged";
        inc.acknowledgedAt = this.now;
        inc.acknowledgedBy = cmd.by;
        inc.assignee ??= cmd.by;
        this.log(cmd.by, "acknowledged", { buildingId: inc.buildingId, incidentId: inc.id, target: inc.id, detail: `Acknowledged after ${formatDuration(this.now - inc.openedAt)}. Escalation stopped.` });
        break;
      }
      case "assign": {
        const inc = this.mustIncident(cmd.incidentId);
        inc.assignee = cmd.to;
        this.log(cmd.by, "assigned", { buildingId: inc.buildingId, incidentId: inc.id, target: inc.id, detail: `Assigned to ${personName(cmd.to)}.` });
        break;
      }
      case "dispatch": {
        const inc = this.mustIncident(cmd.incidentId);
        if (inc.state === "resolved") throw new CommandError(409, `${inc.id} is resolved.`);
        if (inc.state === "open") this.apply({ type: "acknowledge", incidentId: inc.id, by: cmd.by }, false);
        inc.state = "dispatched";
        inc.dispatchedAt = this.now;
        inc.dispatchedTo = cmd.to;
        inc.etaMin = cmd.etaMin;
        inc.assignee = cmd.to;
        const b = buildingById.get(inc.buildingId)!;
        this.log(cmd.by, "dispatched", { buildingId: b.id, incidentId: inc.id, target: inc.id, detail: `Dispatched ${personName(cmd.to)}, ETA ${cmd.etaMin} min (${formatTimeZoned(this.now + cmd.etaMin * M, b.zone)}).` });
        this.at(this.now + cmd.etaMin * M, `arrive-${inc.id}`, () => {
          this.log(cmd.to, "arrived", { buildingId: b.id, incidentId: inc.id, target: inc.id, detail: `On site at ${formatTime(this.now, b.zone)}.` });
          this.emit("logbook");
        });
        break;
      }
      case "on-my-way": {
        const inc = this.mustIncident(cmd.incidentId);
        if (inc.state === "open") this.apply({ type: "acknowledge", incidentId: inc.id, by: cmd.by }, false);
        this.apply({ type: "dispatch", incidentId: inc.id, to: cmd.by, etaMin: cmd.etaMin, by: cmd.by }, false);
        break;
      }
      case "cannot-attend": {
        const inc = this.mustIncident(cmd.incidentId);
        this.log(cmd.by, "incident-escalated", { buildingId: inc.buildingId, incidentId: inc.id, target: inc.id, detail: `${personName(cmd.by)} cannot attend. Escalating to the next person on the roster.` });
        this.apply({ type: "escalate-now", incidentId: inc.id, by: cmd.by }, false);
        break;
      }
      case "escalate-now": {
        const inc = this.mustIncident(cmd.incidentId);
        const policy = criticalPolicy(inc.buildingId);
        const sentSteps = this.world.notifications.filter((n) => n.incidentId === inc.id && n.stepSeq !== null);
        const lastOrder = sentSteps.length ? sentSteps[sentSteps.length - 1]!.step! : 0;
        const next = policy.steps[lastOrder % policy.steps.length]!;
        const prevSeq = sentSteps[sentSteps.length - 1]?.stepSeq ?? 0;
        const ns = runCriticalEscalation({
          incidentId: inc.id,
          buildingId: inc.buildingId,
          policy: { ...policy, steps: [{ ...next, waitMin: 0 }], repeatEveryMin: 0 },
          criticalSince: this.now,
          from: this.now,
          until: this.now,
          ackAt: null,
          summary: inc.title,
          contacts: this.world.contacts,
        }).notifications.map((n) => ({ ...n, id: `${n.id}-now`, stepSeq: prevSeq + 1, step: next.order }));
        this.pushNotifications(ns, `Escalated now by ${personName(cmd.by)}: ${personName(next.personId)}.`, inc);
        break;
      }
      case "close-valve": {
        const b = buildingById.get(cmd.buildingId)!;
        if (!b.hasShutoffValve) throw new CommandError(400, `${b.name} has no automatic shut-off valve.`);
        if (this.valveClosed(b.id, cmd.valveTag)) throw new CommandError(409, `${cmd.valveTag} is already closed.`);
        this.world.effects.add({ kind: "valve-closed", buildingId: b.id, valveTag: cmd.valveTag, from: this.now, to: null });
        const iso = isolationOf(b.id);
        this.log(cmd.by, "valve-closed", { buildingId: b.id, incidentId: cmd.incidentId, target: cmd.valveTag, detail: `Closed ${cmd.valveTag}. ${iso.sentence}` });
        // Pressure and pump alerts on the isolated system are muted while it is isolated.
        const muteIds = iso.deviceIds;
        if (muteIds.length) {
          this.world.effects.add({ kind: "mute", deviceIds: muteIds, reason: `${iso.systemName} isolated by ${cmd.valveTag}`, by: "system", from: this.now, to: null });
          this.log("system", "auto-muted", { buildingId: b.id, incidentId: cmd.incidentId, target: muteIds.map((x) => deviceById(x)!.tag).join(", "), detail: `Pressure and pump alerts on the ${iso.systemName.toLowerCase()} muted while it is isolated.` });
          for (const w of this.watches) {
            if (muteIds.includes(w.device.id)) {
              const st = this.state.get(w.key)!;
              if (st.alertId) {
                const a = this.world.alerts.find((x) => x.id === st.alertId);
                if (a && a.clearedAt === null) a.clearedAt = this.now;
                st.alertId = null;
              }
              st.since = null;
            }
          }
        }
        // The seal leak stops once the pump is isolated; the pump room floor dries in about 40 minutes.
        for (const e of this.world.effects.forBuilding(b.id)) {
          if (e.kind === "leak" && e.to === null) this.world.effects.end(e, this.now);
        }
        for (const d of iso.deviceIds) {
          for (const e of this.world.effects.forDevice(d)) if (e.kind === "pump-duty" && e.to === null) this.world.effects.end(e, this.now);
        }
        for (const e of this.world.effects.list()) {
          if (e.kind === "wet" && e.to === null && e.deviceId.startsWith(`${b.id}/`) && iso.wetDeviceIds.includes(e.deviceId)) {
            this.world.effects.end(e, this.now + 40 * M);
          }
        }
        if (cmd.incidentId) {
          const inc = this.mustIncident(cmd.incidentId);
          inc.isolatedAt = this.now;
          if (inc.leak && inc.leak.to === null) inc.leak.to = this.now;
        }
        this.emit("effects");
        break;
      }
      case "open-valve": {
        const e = this.world.effects.forBuilding(cmd.buildingId).find((x) => x.kind === "valve-closed" && x.valveTag === cmd.valveTag && x.to === null);
        if (!e) throw new CommandError(409, `${cmd.valveTag} is not closed.`);
        this.world.effects.end(e, this.now);
        for (const m of this.world.effects.forBuilding(cmd.buildingId)) {
          if (m.kind === "mute" && m.to === null && m.by === "system") this.world.effects.end(m, this.now);
        }
        this.log(cmd.by, "valve-opened", { buildingId: cmd.buildingId, target: cmd.valveTag, detail: `Opened ${cmd.valveTag}. Supply restored; automatic mutes lifted.` });
        this.emit("effects");
        break;
      }
      case "false-alarm": {
        const inc = this.mustIncident(cmd.incidentId);
        this.applyResolve(inc, "false-alarm", cmd.cause, "Closed as false alarm", cmd.by);
        break;
      }
      case "resolve": {
        const inc = this.mustIncident(cmd.incidentId);
        const wetNow = inc.alertIds
          .map((id) => this.world.alerts.find((a) => a.id === id)!)
          .filter((a) => a.ruleId === "leak-wet")
          .map((a) => deviceById(a.deviceId)!)
          .filter((d) => sample(d.channels[0]!, this.now, this.world.effects) === 1);
        if (wetNow.length) {
          throw new CommandError(409, `${wetNow.map((d) => d.tag).join(", ")} still reads wet. Resolve once it reads dry; the room is drying out.`);
        }
        if (!cmd.cause.trim() || !cmd.action.trim()) throw new CommandError(400, "Record the cause and the action taken before resolving.");
        this.applyResolve(inc, "fixed", cmd.cause, cmd.action, cmd.by);
        break;
      }
      case "note": {
        const inc = this.mustIncident(cmd.incidentId);
        inc.notes.push({ at: this.now, by: cmd.by, text: cmd.text });
        this.log(cmd.by, "note", { buildingId: inc.buildingId, incidentId: inc.id, target: inc.id, detail: cmd.text });
        break;
      }
      case "photo": {
        const inc = this.mustIncident(cmd.incidentId);
        inc.photos.push({ at: this.now, by: cmd.by, caption: cmd.caption });
        this.log(cmd.by, "photo", { buildingId: inc.buildingId, incidentId: inc.id, target: inc.id, detail: cmd.caption });
        break;
      }
      case "mute": {
        if (!cmd.reason.trim()) throw new CommandError(400, "A mute needs a reason, for example the maintenance being done.");
        if (cmd.until <= this.now) throw new CommandError(400, "The mute must end after now.");
        this.world.effects.add({ kind: "mute", deviceIds: cmd.deviceIds, reason: cmd.reason, by: cmd.by, from: this.now, to: cmd.until });
        const first = deviceById(cmd.deviceIds[0]!)!;
        const b = buildingById.get(first.buildingId)!;
        this.log(cmd.by, "muted", { buildingId: b.id, target: cmd.deviceIds.map((x) => deviceById(x)!.tag).join(", "), detail: `Muted until ${formatTimeZoned(cmd.until, b.zone)}. Reason: ${cmd.reason}.` });
        this.at(cmd.until, `unmute-${this.now}`, () => {
          this.log("system", "unmuted", { buildingId: b.id, target: first.tag, detail: "Mute ended. Alerts resumed." });
        });
        this.emit("effects");
        break;
      }
      case "unmute": {
        for (const id of cmd.deviceIds) {
          for (const e of this.world.effects.forDevice(id)) if (e.kind === "mute" && active(e, this.now)) this.world.effects.end(e, this.now);
        }
        const first = deviceById(cmd.deviceIds[0]!)!;
        this.log(cmd.by, "unmuted", { buildingId: first.buildingId, target: cmd.deviceIds.map((x) => deviceById(x)!.tag).join(", "), detail: "Mute ended early. Alerts resumed." });
        this.emit("effects");
        break;
      }
      case "update-contact": {
        this.contactOverrides.set(cmd.personId, cmd.mobileMasked);
        this.world.contacts.faultyMobiles.delete(cmd.personId);
        this.log(cmd.by, "contact-updated", { buildingId: null, target: personName(cmd.personId), detail: `Mobile number for ${personName(cmd.personId)} updated to ${cmd.mobileMasked}.` });
        this.emit("contacts");
        break;
      }
      case "test-message": {
        const n = testMessage(cmd.personId, this.now, this.world.contacts);
        this.world.notifications.push(n);
        this.log(cmd.by, "test-message", { buildingId: null, target: personName(cmd.personId), detail: `Test SMS to ${personName(cmd.personId)}: ${lowerFirst(n.detail)}.` });
        this.emit("notifications");
        break;
      }
      case "set-tariff": {
        if (!(cmd.perKL > 0 && cmd.perKL < 50)) throw new CommandError(400, "Enter a tariff between A$0.01 and A$50 per kL.");
        this.tariffPerKL = cmd.perKL;
        this.log(cmd.by, "setting-changed", { buildingId: null, target: "Water tariff", detail: `Water tariff set to A$${cmd.perKL.toFixed(2)}/kL (illustrative).` });
        this.emit("settings");
        break;
      }
      case "rename-device": {
        const d = this.mustDevice(cmd.deviceId);
        if (!cmd.name.trim()) throw new CommandError(400, "Enter a name for the device.");
        this.deviceOverrides.set(d.id, { ...this.deviceOverrides.get(d.id), name: cmd.name.trim() });
        this.log(cmd.by, "setting-changed", { buildingId: d.buildingId, deviceId: d.id, target: d.tag, detail: `Renamed ${d.tag} to "${cmd.name.trim()}".` });
        break;
      }
      case "move-device": {
        const d = this.mustDevice(cmd.deviceId);
        if (!cmd.location.trim()) throw new CommandError(400, "Enter where the device now is.");
        const from = this.deviceOverrides.get(d.id)?.location ?? d.location;
        this.deviceOverrides.set(d.id, { ...this.deviceOverrides.get(d.id), location: cmd.location.trim() });
        this.log(cmd.by, "setting-changed", { buildingId: d.buildingId, deviceId: d.id, target: d.tag, detail: `Moved ${d.tag} from ${from} to ${cmd.location.trim()}.` });
        break;
      }
      case "replace-device": {
        const d = this.mustDevice(cmd.deviceId);
        if (!cmd.reason.trim()) throw new CommandError(400, "Record why the device was replaced.");
        const eui = Array.from({ length: 16 }, (_, k) => "0123456789ABCDEF"[(d.devEui.charCodeAt(k) * 7 + this.now / 60_000 + k) % 16 | 0]).join("");
        this.deviceOverrides.set(d.id, { ...this.deviceOverrides.get(d.id), devEui: eui, replacedAt: this.now });
        // a new device reports again straight away
        for (const e of this.world.effects.forDevice(d.id)) if (e.kind === "gap" && e.to === null) this.world.effects.end(e, this.now);
        this.log(cmd.by, "device-commissioned", { buildingId: d.buildingId, deviceId: d.id, target: d.tag, detail: `Replaced ${d.tag}. New DevEUI ${eui}. Reason: ${cmd.reason.trim()}.` });
        this.emit("effects");
        break;
      }
      case "test-alert": {
        const d = this.mustDevice(cmd.deviceId);
        const first = ROSTER_FIRST(d.buildingId);
        const n = testMessage(first, this.now, this.world.contacts);
        n.body = `Test alert from ${d.tag}, ${d.location}. No action needed.`;
        this.world.notifications.push(n);
        this.log(cmd.by, "test-message", { buildingId: d.buildingId, deviceId: d.id, target: d.tag, detail: `Test alert from ${d.tag} sent to ${personName(first)} by SMS: ${lowerFirst(n.detail)}.` });
        this.emit("notifications");
        break;
      }
      case "commission-device": {
        if (!/^[0-9A-F]{16}$/.test(cmd.devEui)) throw new CommandError(400, "A DevEUI is 16 characters, 0 to 9 and A to F. Check the label.");
        if (allDevices().some((d) => d.devEui === cmd.devEui)) throw new CommandError(409, "This DevEUI is already registered. Scan the label again, or check the device is not already installed.");
        if (allDevices().some((d) => d.id === `${cmd.buildingId}/${cmd.tag}`)) throw new CommandError(409, `${cmd.tag} is already in use at this building. Choose another tag.`);
        const d = makeDevice({ ...cmd, installer: cmd.by, at: this.now });
        addDevice(d);
        this.addedDevices.push(d.id);
        for (const w of buildWatches().filter((x) => x.device.id === d.id)) {
          this.watches.push(w);
          this.state.set(w.key, { since: null, alertId: null });
        }
        const level = topologyOf(cmd.buildingId).levels.find((l) => l.id === cmd.levelId)?.label ?? "";
        this.log(cmd.by, "device-commissioned", { buildingId: cmd.buildingId, deviceId: d.id, target: cmd.tag, detail: `Commissioned ${cmd.tag}, ${DEVICE_KIND_LABEL[cmd.kind].toLowerCase()}, ${level}, ${cmd.location}. DevEUI ${cmd.devEui}. Signal and test uplink checked on site.${cmd.photo ? ` Photo: ${cmd.photo}.` : ""}` });
        this.emit("effects");
        break;
      }
      case "trigger":
        this.trigger(cmd.scenario);
        break;
    }
    if (record) this.commands.push({ at: this.now, cmd });
    this.emit("incidents");
    this.emit("logbook");
    this.flush();
  }

  private applyResolve(inc: Incident, code: ResolutionCode, cause: string, action: string, by: string) {
    if (inc.state === "resolved") throw new CommandError(409, `${inc.id} is already resolved.`);
    if (inc.state === "open") {
      inc.acknowledgedAt = this.now;
      inc.acknowledgedBy = by;
    }
    inc.state = "resolved";
    inc.resolvedAt = this.now;
    inc.resolvedBy = by;
    inc.resolution = code;
    inc.cause = cause;
    inc.action = action;
    if (inc.leak && inc.leak.to === null) inc.leak.to = this.now;
    for (const id of inc.alertIds) {
      const a = this.world.alerts.find((x) => x.id === id);
      if (a && a.clearedAt === null) a.clearedAt = this.now;
    }
    // re-arm the watches so a recurrence raises a new incident
    for (const st of this.state.values()) if (st.alertId && inc.alertIds.includes(st.alertId)) st.alertId = null;
    const detail = code === "false-alarm" ? `Closed as false alarm. ${cause}.` : `Resolved. Cause: ${cause}. Action: ${action}.`;
    this.log(by, code === "false-alarm" ? "false-alarm" : "resolved", { buildingId: inc.buildingId, incidentId: inc.id, target: inc.id, detail });
    this.emit("incidents");
  }

  private trigger(s: "burst" | "door" | "gateway" | "leak-false-alarm") {
    const t = this.now;
    if (s === "burst") {
      const b = "140-wexford-street";
      this.world.effects.add({ kind: "leak", buildingId: b, meterTags: ["FT-01"], rateLpm: 180, rampMin: 1, from: t, to: null, note: "Burst main, Level 9" });
      this.world.effects.add({ kind: "pressure-offset", deviceIds: ["PT-03", "PT-04", "PT-05"].map((x) => `${b}/${x}`), kpa: -90, rampMin: 2, from: t, to: null });
      this.world.effects.add({ kind: "wet", deviceId: `${b}/WL-L9-01`, from: t + 3 * M, to: null });
      // Priya acknowledges from her phone a few minutes after it goes critical.
      this.at(t + 6 * M, "priya-ack", () => {
        const inc = this.world.incidents.find((i) => i.buildingId === b && i.state === "open" && i.severity === "critical");
        if (inc) this.apply({ type: "acknowledge", incidentId: inc.id, by: "priya" }, false);
      });
    } else if (s === "door") {
      const door = this.world.effects.add({ kind: "door-open", doorId: "wattle-grove/DC-01", probeId: "wattle-grove/TT-05", from: t, to: null });
      this.at(t + 14 * M, "door-close", () => {
        this.world.effects.end(door, this.now);
        this.log("sandra", "note", { buildingId: "wattle-grove", target: "DC-01", detail: "Cool room 1 door closed." });
      });
    } else if (s === "gateway") {
      const behind = allDevices().filter((d) => d.gatewayId === "ellery-house-hotel/GW-04").length;
      this.world.effects.add({ kind: "gap", deviceIds: ["ellery-house-hotel/GW-04"], reason: "Gateway not responding", from: t, to: null });
      this.log("system", "device-offline", { buildingId: "ellery-house-hotel", deviceId: "ellery-house-hotel/GW-04", target: "GW-04", detail: `Gateway GW-04 stopped reporting. Readings from ${behind} devices paused.` });
    } else if (s === "leak-false-alarm") {
      this.world.effects.add({ kind: "wet", deviceId: "lorne-road-medical/WL-G-01", from: t, to: t + 6 * M });
    }
    this.emit("effects");
  }

  // ---- helpers -----------------------------------------------------------------------

  valveClosed(buildingId: string, tag: string, t = this.now): boolean {
    return this.world.effects.forBuilding(buildingId).some((e) => e.kind === "valve-closed" && e.valveTag === tag && active(e, t));
  }

  incidentOf(a: Alert): Incident | undefined {
    return this.world.incidents.find((i) => i.id === a.incidentId);
  }

  private mustDevice(id: string) {
    const d = deviceById(id);
    if (!d) throw new CommandError(404, `No device ${id.split("/")[1] ?? id}.`);
    return d;
  }

  private mustIncident(id: string): Incident {
    const inc = this.world.incidents.find((i) => i.id === id);
    if (!inc) throw new CommandError(404, `No incident ${id}.`);
    return inc;
  }

  private log(actor: string, action: LogbookAction, e: Partial<LogbookEntry> & { detail: string; target: string; at?: UtcMs }) {
    const entry: LogbookEntry = {
      id: `L-${String(++this.world.seq.logbook).padStart(6, "0")}`,
      at: e.at ?? this.now,
      actor,
      action,
      buildingId: e.buildingId ?? null,
      incidentId: e.incidentId ?? null,
      deviceId: e.deviceId ?? null,
      target: e.target,
      detail: e.detail,
    };
    this.world.logbook.push(entry);
    this.emit("logbook");
    return entry;
  }
}

// ---- wording -----------------------------------------------------------------------

const UNIT: Record<string, Unit> = { flow: "L/min", pressure: "kPa", level: "%", duty: "%", temperature: "°C" };

function alertSummary(w: Watch, value: number): string {
  const r = w.rule;
  switch (r.template) {
    case "leak-wet":
      return `Leak sensor ${w.device.tag} wet`;
    case "burst":
      return `Flow ${formatValue(value, "L/min")} above expected for ${r.minDurationMin} min`;
    case "overnight-flow":
      return `Overnight flow above baseline for ${r.minDurationMin} min`;
    case "low-pressure":
      return `Pressure below ${r.threshold} kPa`;
    case "tank-low":
      return `Tank level below ${r.threshold}% for ${r.minDurationMin} min`;
    case "tank-high":
      return `Tank level above ${r.threshold}% for ${r.minDurationMin} min`;
    case "pump-runtime":
      return `Pump duty above normal for ${r.minDurationMin} min`;
    case "cool-room-temperature":
      return `Cool room above ${r.threshold} °C for ${r.minDurationMin} min`;
    case "hot-water-temperature":
      return `Hot water return below ${r.threshold} °C for ${r.minDurationMin} min`;
    case "door-open":
      return `Cool room door open for ${r.minDurationMin} min`;
    case "device-offline":
      return `Gateway ${w.device.tag} not heard for ${r.minDurationMin} min`;
  }
}

function titleFor(w: Watch): string {
  switch (w.rule.template) {
    case "leak-wet":
      return "Leak";
    case "burst":
      return "Burst";
    case "device-offline":
      return "Gateway offline";
    case "cool-room-temperature":
    case "door-open":
      return "Cool room above limit";
    default:
      return w.rule.name;
  }
}

function categoryFor(w: Watch): Incident["category"] {
  switch (w.rule.template) {
    case "leak-wet":
      return "leak-minor";
    case "burst":
      return "burst";
    case "overnight-flow":
      return "overnight-flow";
    case "low-pressure":
      return "low-pressure";
    case "tank-low":
    case "tank-high":
      return "tank";
    case "pump-runtime":
      return "pump";
    case "cool-room-temperature":
    case "door-open":
      return "cool-room";
    case "hot-water-temperature":
      return "hot-water";
    default:
      return "gateway-offline";
  }
}

/** What closing a building's isolation valve takes out of service. */
export function isolationOf(buildingId: string): { sentence: string; levels: string; apartments: number | null; deviceIds: string[]; wetDeviceIds: string[]; systemName: string } {
  const b = buildingById.get(buildingId)!;
  const topo = topologyOf(buildingId);
  const valve = topo.equipment.find((e) => e.tag === "XV-01");
  const system = topo.systems.find((s) => s.id === valve?.systemId);
  if (!valve || !system) return { sentence: "", levels: "", apartments: null, deviceIds: [], wetDeviceIds: [], systemName: "" };
  const from = topo.levels.find((l) => l.id === system.servesFrom)!;
  const to = topo.levels.find((l) => l.id === system.servesTo)!;
  const served = topo.levels.filter((l) => l.order >= from.order && l.order <= to.order && l.short.startsWith("L"));
  const first = served[0];
  const last = served[served.length - 1];
  const perLevel = b.type === "strata" || b.type === "holiday-apartments" ? Math.round(b.occupancy.count / b.levels) : null;
  const apartments = perLevel ? perLevel * served.length : null;
  const levels = first && last ? `Levels ${first.label.replace("Level ", "")} to ${last.label.replace("Level ", "")}` : system.name;
  const devices = allDevices().filter((d) => d.buildingId === buildingId && d.systemId === system.id);
  const deviceIds = devices.filter((d) => d.kind === "pressure-sensor" || d.kind === "pump-monitor").map((d) => d.id);
  const wetDeviceIds = devices.filter((d) => d.kind === "leak-sensor" && topo.levels.find((l) => l.id === d.levelId)?.id === valve.levelId).map((d) => d.id);
  const sentence = `${system.name} isolated: no water supply to ${levels}${apartments ? ` (${served.length} levels, ${apartments} apartments)` : ""}.`;
  return { sentence, levels, apartments, deviceIds, wetDeviceIds, systemName: system.name };
}

export type { Effect };


/** "Held: Helen's quiet hours" becomes "held: Helen's quiet hours". */
function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
