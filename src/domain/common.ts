/**
 * Shared vocabulary for both layers. The full entity types (Device, Channel,
 * Reading, Gateway in the ingestion layer; Building, Level, System, Equipment,
 * Rule, Alert, Incident in the building-protection module) arrive in M2.
 */
import type { AuZone } from "@/lib/format";

/** UTC milliseconds. Every stored time is one of these. */
export type UtcMs = number;

export type AuState = "NSW" | "VIC" | "QLD" | "SA" | "WA" | "TAS" | "ACT";

export const STATE_ORDER: readonly AuState[] = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT"];

export const ZONE_BY_STATE: Record<AuState, AuZone> = {
  NSW: "Australia/Sydney",
  ACT: "Australia/Sydney",
  VIC: "Australia/Melbourne",
  TAS: "Australia/Hobart",
  QLD: "Australia/Brisbane",
  SA: "Australia/Adelaide",
  WA: "Australia/Perth",
};

export type BuildingType =
  | "strata"
  | "hotel"
  | "shopping-centre"
  | "healthcare"
  | "aged-care"
  | "office"
  | "school"
  | "holiday-apartments"
  | "retail";

export const BUILDING_TYPE_LABEL: Record<BuildingType, string> = {
  strata: "Strata",
  hotel: "Hotel",
  "shopping-centre": "Shopping centre",
  healthcare: "Healthcare",
  "aged-care": "Aged care",
  office: "Commercial office",
  school: "School campus",
  "holiday-apartments": "Holiday apartments",
  retail: "Retail",
};

/** Status that carries colour. Everything else is ink. */
export type Status = "critical" | "warning" | "offline" | "muted";

/** Worst first. Used to sort by attention and to roll status up the tree. */
export const STATUS_RANK: Record<Status | "normal", number> = {
  critical: 0,
  warning: 1,
  offline: 2,
  muted: 3,
  normal: 4,
};

export const STATUS_LABEL: Record<Status, string> = {
  critical: "Critical",
  warning: "Warning",
  offline: "Offline",
  muted: "Muted",
};

export function worstStatus(list: Iterable<Status | "normal" | undefined>): Status | "normal" {
  let worst: Status | "normal" = "normal";
  for (const s of list) if (s && STATUS_RANK[s] < STATUS_RANK[worst]) worst = s;
  return worst;
}

/** The eight annunciator windows, in fixed order. */
export const ANNUNCIATOR_CHANNELS = ["leak", "flow", "pressure", "tank", "pump", "temperature", "power", "link"] as const;
export type AnnunciatorChannel = (typeof ANNUNCIATOR_CHANNELS)[number];

export const ANNUNCIATOR_LABEL: Record<AnnunciatorChannel, string> = {
  leak: "Leak",
  flow: "Flow",
  pressure: "Pressure",
  tank: "Tank",
  pump: "Pump",
  temperature: "Temperature",
  power: "Power",
  link: "Link",
};

export type AnnunciatorState = Partial<Record<AnnunciatorChannel, Status>>;

export type IncidentState = "open" | "acknowledged" | "dispatched" | "resolved";
export type Severity = "critical" | "warning";

export type Role = "helen" | "marcus" | "tom" | "kayla";
