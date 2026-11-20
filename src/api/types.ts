/**
 * API contract types. These are the shapes a real FastAPI backend returns;
 * docs/api-contract.md documents each endpoint against them.
 */
import type { AnnunciatorState, AuState, BuildingType, Status, UtcMs } from "@/domain/common";
import type { OpenIncidentSummary, DeviceExceptionSummary } from "@/mock/scenarios/startState";
import type { AuZone } from "@/lib/format";

export type { OpenIncidentSummary, DeviceExceptionSummary };

export interface BuildingSummary {
  id: string;
  name: string;
  shortName: string;
  suburb: string;
  state: AuState;
  zone: AuZone;
  type: BuildingType;
  deviceCount: number;
  status: Status | "normal";
  annunciator: AnnunciatorState;
}

/** GET /api/portfolio/status */
export interface PortfolioStatus {
  organisation: { id: string; name: string; shortName: string; viewerZone: AuZone };
  asOf: UtcMs;
  buildings: BuildingSummary[];
  openIncidents: OpenIncidentSummary[];
  deviceExceptions: DeviceExceptionSummary[];
}
