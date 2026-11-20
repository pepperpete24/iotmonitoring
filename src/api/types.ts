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
}
