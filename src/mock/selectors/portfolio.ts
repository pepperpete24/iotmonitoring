import type { BuildingSummary, PortfolioStatus } from "@/api/types";
import { type AnnunciatorState, type Status, STATUS_RANK, worstStatus } from "@/domain/common";
import { BUILDINGS, ORGANISATION } from "@/mock/world/buildings";
import { DEVICE_EXCEPTIONS_AT_START, EXTRA_LIT, OPEN_AT_START } from "@/mock/scenarios/startState";
import type { UtcMs } from "@/domain/common";

const lightWindow = (ann: AnnunciatorState, channel: keyof AnnunciatorState, status: Status) => {
  const current = ann[channel];
  if (!current || STATUS_RANK[status] < STATUS_RANK[current]) ann[channel] = status;
};

export function selectPortfolioStatus(asOf: UtcMs): PortfolioStatus {
  const openIncidents = OPEN_AT_START.filter((i) => i.state !== "resolved");
  const deviceExceptions = [...DEVICE_EXCEPTIONS_AT_START];

  const buildings: BuildingSummary[] = BUILDINGS.map((b) => {
    const ann: AnnunciatorState = {};
    const incidents = openIncidents.filter((i) => i.buildingId === b.id);
    for (const i of incidents) lightWindow(ann, i.channel, i.severity);
    for (const [ch, st] of Object.entries(EXTRA_LIT[b.id] ?? {})) {
      if (incidents.length) lightWindow(ann, ch as keyof AnnunciatorState, st as Status);
    }
    const devices = deviceExceptions.filter((d) => d.buildingId === b.id);
    // Offline devices light the Link window. Muted devices do not light anything.
    for (const d of devices) if (d.status === "offline") lightWindow(ann, "link", "offline");
    const status = worstStatus([...incidents.map((i) => i.severity), ...devices.map((d) => d.status)]);
    return {
      id: b.id,
      name: b.name,
      shortName: b.shortName,
      suburb: b.suburb,
      state: b.state,
      zone: b.zone,
      type: b.type,
      deviceCount: b.deviceCount,
      status,
      annunciator: ann,
    };
  });

  return {
    organisation: {
      id: ORGANISATION.id,
      name: ORGANISATION.name,
      shortName: ORGANISATION.shortName,
      viewerZone: ORGANISATION.viewerZone,
    },
    asOf,
    buildings,
    openIncidents,
    deviceExceptions,
  };
}
