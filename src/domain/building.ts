/**
 * Building-protection module: everything customer-facing for this product.
 * Sits on the ingestion layer by reference (device and channel ids).
 */
import type { AnnunciatorChannel, IncidentState, Severity, UtcMs } from "./common";

export interface Level {
  id: string; // `${buildingId}/L12`
  buildingId: string;
  label: string; // "Level 12", "B2", "Roof", "Plant"
  short: string; // "L12", "B2", "RF"
  /** Finished floor height in metres relative to ground. */
  heightM: number;
  order: number; // bottom to top
}

export type SystemType =
  | "cold-water"
  | "booster"
  | "hot-water"
  | "fire-tank"
  | "rainwater"
  | "refrigeration"
  | "network";

export interface System {
  id: string;
  buildingId: string;
  name: string; // "Cold water riser A"
  type: SystemType;
  /** Levels this system serves, bottom to top (inclusive). */
  servesFrom: string;
  servesTo: string;
  /** Horizontal lane in the riser diagram, 0 = leftmost. */
  lane: number;
}

export type EquipmentKind =
  | "pump"
  | "booster-set"
  | "tank"
  | "valve"
  | "isolation-valve"
  | "meter"
  | "prv"
  | "cool-room"
  | "hot-water-unit";

export interface Equipment {
  id: string;
  buildingId: string;
  tag: string; // P-02, TK-01, XV-01
  name: string;
  kind: EquipmentKind;
  levelId: string;
  systemId: string;
}

export type RuleTemplate =
  | "overnight-flow"
  | "burst"
  | "low-pressure"
  | "tank-low"
  | "tank-high"
  | "pump-runtime"
  | "cool-room-temperature"
  | "hot-water-temperature"
  | "door-open"
  | "leak-wet"
  | "device-offline";

export interface Rule {
  id: string;
  template: RuleTemplate;
  name: string;
  severity: Severity;
  /** Customer-set threshold, in the channel's unit. */
  threshold: number;
  /** Minutes the condition must hold. */
  minDurationMin: number;
  hysteresis: number;
  /** Local-time window the rule is active, or null for always. */
  schedule: { from: string; to: string } | null;
  scope: { buildingIds: string[] | "all" };
  annunciator: AnnunciatorChannel;
}

export interface Alert {
  id: string;
  ruleId: string;
  incidentId: string;
  buildingId: string;
  deviceId: string;
  channelId: string;
  severity: Severity;
  raisedAt: UtcMs;
  value: number;
  /** "Overnight flow above baseline for 30 min" */
  summary: string;
  clearedAt: UtcMs | null;
}

export type IncidentCategory =
  | "leak-minor"
  | "leak-false-alarm"
  | "overnight-flow"
  | "pump"
  | "tank"
  | "cool-room"
  | "hot-water"
  | "low-pressure"
  | "gateway-offline"
  | "burst";

export const INCIDENT_CATEGORY_LABEL: Record<IncidentCategory, string> = {
  "leak-minor": "Leak, confirmed minor",
  "leak-false-alarm": "Leak sensor, false alarm",
  "overnight-flow": "Abnormal overnight flow",
  pump: "Pump run-time or failure",
  tank: "Tank level",
  "cool-room": "Cool room temperature",
  "hot-water": "Hot water return temperature",
  "low-pressure": "Low pressure",
  "gateway-offline": "Gateway offline",
  burst: "Burst or major leak",
};

export type ResolutionCode = "fixed" | "false-alarm" | "no-fault-found" | "external";

export interface Incident {
  id: string; // I-2026-0167
  buildingId: string;
  category: IncidentCategory;
  severity: Severity;
  /** Highest severity reached. */
  peakSeverity: Severity;
  state: IncidentState;
  title: string;
  location: string;
  levelId: string | null;
  channel: AnnunciatorChannel;
  openedAt: UtcMs;
  severitySince: UtcMs;
  acknowledgedAt: UtcMs | null;
  acknowledgedBy: string | null;
  dispatchedAt: UtcMs | null;
  dispatchedTo: string | null;
  etaMin: number | null;
  isolatedAt: UtcMs | null;
  resolvedAt: UtcMs | null;
  resolvedBy: string | null;
  resolution: ResolutionCode | null;
  cause: string | null;
  action: string | null;
  assignee: string | null;
  alertIds: string[];
  /**
   * Excess flow measured by a meter while the incident ran. Water lost is
   * rate x minutes from `from` to `to` (or now, while still running).
   * Null where no meter measured it, for example a leak sensor alone.
   */
  leak: { rateLpm: number; from: UtcMs; to: UtcMs | null; meterTag: string } | null;
  /** Free-text notes, newest last. */
  notes: Array<{ at: UtcMs; by: string; text: string }>;
  photos: Array<{ at: UtcMs; by: string; caption: string }>;
  /** Units or areas damaged, recorded by people, never priced. */
  damage: string | null;
}

export type NotifyChannel = "sms" | "push" | "email";
export type DeliveryResult = "sent" | "delivered" | "failed" | "read" | "held";

export interface EscalationStep {
  order: number;
  personId: string;
  channels: NotifyChannel[];
  waitMin: number;
}

export interface EscalationPolicy {
  id: string;
  name: string;
  severity: Severity;
  steps: EscalationStep[];
  repeatEveryMin: number;
  /** SMS is held for warnings in this window. */
  warningSmsQuiet: { from: string; to: string };
}

export interface Notification {
  id: string;
  incidentId: string;
  /** Escalation step number within its cycle, or null for a warning notice. */
  step: number | null;
  /** Running step count across cycles (1 to 12 in the hero incident). */
  stepSeq: number | null;
  cycle: number | null;
  personId: string;
  channel: NotifyChannel;
  at: UtcMs;
  result: DeliveryResult;
  /** Plain words: "Number not in service". */
  detail: string;
  /** The message text as sent. */
  body: string;
}

export type LogbookAction =
  | "alert-raised"
  | "alert-cleared"
  | "incident-opened"
  | "incident-escalated"
  | "severity-raised"
  | "notification"
  | "acknowledged"
  | "assigned"
  | "dispatched"
  | "arrived"
  | "valve-closed"
  | "valve-opened"
  | "isolated"
  | "muted"
  | "unmuted"
  | "auto-muted"
  | "note"
  | "photo"
  | "resolved"
  | "false-alarm"
  | "contact-updated"
  | "test-message"
  | "device-commissioned"
  | "device-offline"
  | "device-online"
  | "setting-changed";

export interface LogbookEntry {
  id: string;
  at: UtcMs;
  /** Person id, or "system". */
  actor: string;
  action: LogbookAction;
  buildingId: string | null;
  incidentId: string | null;
  deviceId: string | null;
  /** Short target label: "I-2026-0167", "XV-01". */
  target: string;
  detail: string;
}

export type PersonRole = "admin" | "portfolio-manager" | "building-manager" | "responder" | "viewer";

export interface Person {
  id: string;
  name: string;
  title: string;
  organisation: string;
  role: PersonRole;
  mobileMasked: string;
  email: string;
  buildingIds: string[] | "all";
  /** Quiet hours for SMS, local time. */
  quietHours: { from: string; to: string } | null;
  /** The number on file is wrong: SMS fails. */
  mobileFaulty: boolean;
}
