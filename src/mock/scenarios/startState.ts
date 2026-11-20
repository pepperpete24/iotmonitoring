/**
 * What is open at the demo start, Fri 20 Nov 2026 07:48 AEDT.
 *
 * M1 fixture so the shell has something real to show. M2 replaces this with
 * state produced by the engine replaying the scenario, and these values
 * become test expectations instead.
 */
import type { AnnunciatorChannel, IncidentState, Severity, Status, UtcMs } from "@/domain/common";

/** Fri 20 Nov 2026, 07:48:00 AEDT (UTC+11). */
export const DEMO_START: UtcMs = Date.UTC(2026, 10, 19, 20, 48, 0);

const aedt = (day: number, h: number, m: number) => Date.UTC(2026, 10, day, h - 11, m);
const aest = (day: number, h: number, m: number) => Date.UTC(2026, 10, day, h - 10, m);

export interface OpenIncidentSummary {
  id: string;
  buildingId: string;
  severity: Severity;
  state: IncidentState;
  channel: AnnunciatorChannel;
  /** What a hydraulic contractor would call it. */
  title: string;
  location: string;
  openedAt: UtcMs;
  /** When it last reached its current severity. */
  severitySince: UtcMs;
  acknowledgedAt?: UtcMs;
  acknowledgedBy?: string;
  alertCount: number;
}

export const OPEN_AT_START: readonly OpenIncidentSummary[] = [
  {
    id: "I-2026-0167",
    buildingId: "kendall-street-tower",
    severity: "critical",
    state: "open",
    channel: "leak",
    title: "Leak",
    location: "B2 booster pump room",
    openedAt: aedt(20, 2, 10),
    severitySince: aedt(20, 4, 12),
    alertCount: 3,
  },
  {
    id: "I-2026-0166",
    buildingId: "parkside-secondary",
    severity: "warning",
    state: "acknowledged",
    channel: "tank",
    title: "Rainwater tank 2 low",
    location: "Rainwater tank 2, Building C",
    openedAt: aedt(18, 7, 22),
    severitySince: aedt(18, 7, 22),
    acknowledgedAt: aedt(18, 8, 3),
    acknowledgedBy: "Helen Castellano",
    alertCount: 1,
  },
  {
    id: "I-2026-0169",
    buildingId: "wattle-grove",
    severity: "warning",
    state: "acknowledged",
    channel: "temperature",
    title: "Cool room 2 above limit",
    location: "Kitchen, Ground",
    openedAt: aest(20, 6, 6),
    severitySince: aest(20, 6, 6),
    acknowledgedAt: aest(20, 6, 27),
    acknowledgedBy: "Sandra Lindqvist",
    alertCount: 2,
  },
  {
    id: "I-2026-0170",
    buildingId: "140-wexford-street",
    severity: "warning",
    state: "open",
    channel: "pressure",
    title: "Low pressure",
    location: "Level 21",
    openedAt: aedt(20, 7, 31),
    severitySince: aedt(20, 7, 31),
    alertCount: 1,
  },
];

export interface DeviceExceptionSummary {
  buildingId: string;
  tag: string;
  status: Extract<Status, "offline" | "muted">;
  channel: AnnunciatorChannel;
  detail: string;
}

export const DEVICE_EXCEPTIONS_AT_START: readonly DeviceExceptionSummary[] = [
  { buildingId: "riverbend-plaza", tag: "FT-04", status: "offline", channel: "link", detail: "Battery flat" },
  { buildingId: "hay-street-exchange", tag: "PT-03", status: "offline", channel: "link", detail: "Weak signal" },
  { buildingId: "glenelg-health-hub", tag: "WL-L1-01", status: "muted", channel: "leak", detail: "Plumbing works, Level 1" },
  { buildingId: "glenelg-health-hub", tag: "WL-L1-02", status: "muted", channel: "leak", detail: "Plumbing works, Level 1" },
  { buildingId: "glenelg-health-hub", tag: "WL-L1-03", status: "muted", channel: "leak", detail: "Plumbing works, Level 1" },
  { buildingId: "glenelg-health-hub", tag: "PT-02", status: "muted", channel: "pressure", detail: "Plumbing works, Level 1" },
];

/** Annunciator windows lit beyond the incident's own channel (grouped alerts). */
export const EXTRA_LIT: Readonly<Record<string, Partial<Record<AnnunciatorChannel, Status>>>> = {
  "kendall-street-tower": { flow: "warning", pump: "warning" },
};
