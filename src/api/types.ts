/**
 * API contract types: the shapes a real FastAPI backend returns.
 * docs/api-contract.md documents each endpoint against them.
 */
import type { AnnunciatorChannel, AnnunciatorState, AuState, BuildingType, IncidentState, Severity, Status, UtcMs } from "@/domain/common";
import type { DeliveryResult, IncidentCategory, LogbookAction, NotifyChannel, ResolutionCode } from "@/domain/building";
import type { AuZone } from "@/lib/format";

export interface OrganisationRef {
  id: string;
  name: string;
  shortName: string;
  viewerZone: AuZone;
  tariffPerKL: number;
}

export interface BuildingSummary {
  id: string;
  name: string;
  shortName: string;
  address: string;
  suburb: string;
  state: AuState;
  zone: AuZone;
  type: BuildingType;
  lat: number;
  lon: number;
  status: Status | "normal";
  annunciator: AnnunciatorState;
  openIncidents: number;
  topIncidentId: string | null;
  devicesOnline: number;
  devicesTotal: number;
  devicesMuted: number;
  water24hL: number;
  water24hUsualL: number;
  nightFlowLpm: number | null;
  nightBaselineLpm: number;
  lastReadingAt: UtcMs | null;
}

export interface IncidentSummary {
  id: string;
  buildingId: string;
  buildingName: string;
  zone: AuZone;
  category: IncidentCategory;
  severity: Severity;
  peakSeverity: Severity;
  state: IncidentState;
  title: string;
  location: string;
  levelLabel: string | null;
  channel: AnnunciatorChannel;
  openedAt: UtcMs;
  severitySince: UtcMs;
  acknowledgedAt: UtcMs | null;
  acknowledgedBy: string | null; // display name
  assignee: string | null; // display name
  alertCount: number;
  resolvedAt: UtcMs | null;
  resolution: ResolutionCode | null;
  waterLostL: number | null;
  costAUD: number | null;
}

export interface DeviceRef {
  id: string;
  tag: string;
  buildingId: string;
  location: string;
  status: "offline" | "paused" | "muted";
  detail: string;
}

/** GET /api/portfolio/status */
export interface PortfolioStatus {
  organisation: OrganisationRef;
  asOf: UtcMs;
  briefing: {
    critical: Array<{ incidentId: string; buildingId: string; acknowledged: boolean; criticalForMs: number }>;
    warnings: number;
    warningsUnacknowledged: number;
    offline: number;
    muted: number;
    water24hL: number;
    water24hUsualL: number;
    weekday: string;
  };
  buildings: BuildingSummary[];
  openIncidents: IncidentSummary[];
  deviceExceptions: DeviceRef[];
}

export interface AlertView {
  id: string;
  ruleName: string;
  severity: Severity;
  deviceId: string;
  deviceTag: string;
  location: string;
  summary: string;
  raisedAt: UtcMs;
  value: number;
  unit: string | null;
  clearedAt: UtcMs | null;
}

export interface NotificationView {
  id: string;
  at: UtcMs;
  stepSeq: number | null;
  cycle: number | null;
  person: string;
  personId: string;
  channel: NotifyChannel;
  result: DeliveryResult;
  detail: string;
  body: string;
}

export interface LogbookView {
  id: string;
  at: UtcMs;
  actor: string; // display name
  actorId: string;
  action: LogbookAction;
  buildingId: string | null;
  buildingName: string | null;
  zone: AuZone | null;
  incidentId: string | null;
  deviceId: string | null;
  target: string;
  detail: string;
}

export interface ReadingView {
  measure: string;
  value: number;
  unit: string;
  at: UtcMs;
}

export interface DeviceLive {
  id: string;
  tag: string;
  /** A name a person gave it, if any. */
  name: string | null;
  kind: string;
  kindLabel: string;
  model: string;
  location: string;
  buildingId: string;
  levelId: string;
  systemId: string | null;
  equipmentId: string | null;
  status: "online" | "offline" | "paused" | "muted";
  muteReason: string | null;
  muteUntil: UtcMs | null;
  alert: Severity | null;
  /** The open incident this device's alert belongs to. */
  openIncidentId: string | null;
  readings: ReadingView[];
  lastUplink: UtcMs | null;
  battery: number;
  rssi: number;
  snr: number;
  /** Typical RSSI worse than -110 dBm (the latest uplink varies a few dBm either side). */
  weakSignal: boolean;
  link: string;
  gatewayTag: string | null;
  firmware: string;
  firmwareLatest: boolean;
  devEui: string;
}

export interface LevelView {
  id: string;
  label: string;
  short: string;
  heightM: number;
  order: number;
}

export interface SystemView {
  id: string;
  name: string;
  type: string;
  servesFrom: string;
  servesTo: string;
  lane: number;
}

export interface EquipmentView {
  id: string;
  tag: string;
  name: string;
  kind: string;
  levelId: string;
  systemId: string;
}

/** GET /api/buildings/:id */
export interface BuildingDetail {
  summary: BuildingSummary;
  typeLabel: string;
  levelsAbove: number;
  basements: number;
  campusBuildings: number | null;
  occupancy: string;
  contacts: Array<{ name: string; title: string; mobileMasked: string; email: string }>;
  roster: string[];
  levels: LevelView[];
  systems: SystemView[];
  equipment: EquipmentView[];
  devices: DeviceLive[];
  incidents: IncidentSummary[];
  valve: { tag: string; closed: boolean; isolation: string } | null;
  /** Where water is escaping, for the riser drawing: from the meter that sees it to where it is. */
  waterFault: { incidentId: string; severity: Severity; meterLevelId: string; faultLevelId: string; systemId: string | null } | null;
}

/** GET /api/devices/:id */
export interface DeviceDetail {
  device: DeviceLive;
  buildingName: string;
  zone: string;
  levelLabel: string;
  systemName: string | null;
  installer: string;
  installedAt: UtcMs;
  calibratedAt: UtcMs | null;
  replacedAt: UtcMs | null;
  lossRatePct: number;
  rules: string[];
  /** Battery % at local midnight each day for 90 days. */
  battery: Array<[UtcMs, number]>;
  /** Hourly RSSI and SNR for 7 days; null where the device was silent. */
  signal: Array<[UtcMs, number | null, number | null]>;
  uplinks: Array<{ at: UtcMs; rssi: number; snr: number; battery: number; values: string }>;
  gaps: Array<{ from: UtcMs; to: UtcMs; reason: string }>;
}

/** GET /api/water */
export interface WaterView {
  scope: { buildingId: string | null; name: string };
  tariffPerKL: number;
  /** Last 30 days, one row per local day: actual and the usual for that weekday. */
  daily: Array<{ day: UtcMs; actualL: number; expectedL: number }>;
  /** Last 48 hours by hour. */
  hourly: Array<{ t: UtcMs; actualL: number; expectedL: number }>;
  /** Overnight figure for 30 nights for one building, with the trailing baseline band. */
  nights: { buildingId: string; name: string; points: Array<{ night: UtcMs; value: number | null; p10: number; p50: number; p90: number; breach: boolean }> };
  anomalies: Array<{ buildingId: string; name: string; night: UtcMs; value: number; baseline: number; excess: number; incidentId: string | null }>;
  benchmark: Array<{ type: string; unitLabel: string; rows: Array<{ buildingId: string; name: string; perUnitL: number }> }>;
  totals: { last30L: number; usual30L: number; cost30AUD: number; leakLossL: number; leakCostAUD: number };
}

/** GET /api/series */
export interface SeriesView {
  channelId: string;
  measure: string;
  unit: string;
  from: UtcMs;
  to: UtcMs;
  stepMs: number;
  points: Array<[UtcMs, number | null]>;
  gaps: Array<{ from: UtcMs; to: UtcMs; reason: string }>;
}

/** GET /api/incidents/:id */
export interface IncidentDetail extends IncidentSummary {
  alerts: AlertView[];
  notifications: NotificationView[];
  escalation: { steps: number; messages: number; delivered: number; failed: number; held: number; acknowledged: boolean };
  timeline: LogbookView[];
  leak: { rateLpm: number; from: UtcMs; to: UtcMs | null; meterTag: string } | null;
  dailyLossL: number | null;
  dailyCostAUD: number | null;
  tariffPerKL: number;
  dispatchedTo: string | null;
  dispatchedAt: UtcMs | null;
  etaMin: number | null;
  isolatedAt: UtcMs | null;
  resolvedBy: string | null;
  cause: string | null;
  action: string | null;
  notes: Array<{ at: UtcMs; by: string; text: string }>;
  photos: Array<{ at: UtcMs; by: string; caption: string }>;
  damage: string | null;
  valve: { tag: string; closed: boolean; isolation: string } | null;
  /** Leak sensors on this incident that still read wet. Resolve waits for them. */
  wetSensors: string[];
  /** How a responder gets in. */
  access: string;
  /** Who to call on site: the building's first contact. */
  siteContact: { name: string; mobileMasked: string } | null;
}
