/**
 * The monthly portfolio report. Every figure is derived from the same
 * incident table the app shows, so the report reconciles with it exactly.
 */
import type { IncidentSummary } from "@/api/types";
import type { UtcMs } from "@/domain/common";
import { INCIDENT_CATEGORY_LABEL, type IncidentCategory } from "@/domain/building";
import { fromLocal, localParts, MINUTE } from "@/lib/format";
import type { Engine } from "@/mock/engine/engine";
import { BUILDINGS, buildingById, ORGANISATION } from "@/mock/world/buildings";
import { incidentSummary } from "./views";

export interface MonthlyReport {
  organisation: string;
  month: string; // 2026-10
  label: string; // October 2026
  from: UtcMs;
  to: UtcMs;
  zone: string;
  preparedAt: UtcMs;
  tariffPerKL: number;
  incidents: Array<IncidentSummary & { ackMin: number | null; businessHours: boolean }>;
  totals: {
    incidents: number;
    critical: number;
    falseAlarms: number;
    buildingsAffected: number;
    waterLostL: number;
    costAUD: number;
    medianAckBusinessMin: number | null;
    medianAckAfterMin: number | null;
    slowest: { incidentId: string; buildingName: string; ackMin: number } | null;
    largestLoss: { incidentId: string; buildingName: string; litres: number } | null;
  };
  byCategory: Array<{ category: IncidentCategory; label: string; count: number; critical: number; waterLostL: number }>;
  byBuilding: Array<{ buildingId: string; name: string; count: number; critical: number; waterLostL: number }>;
  months: Array<{ value: string; label: string }>;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length / 2;
  return s.length % 2 ? s[Math.floor(m)]! : (s[m - 1]! + s[m]!) / 2;
}

export function monthlyReport(engine: Engine, month: string, now: UtcMs): MonthlyReport {
  const zone = ORGANISATION.viewerZone;
  const [y, m] = month.split("-").map(Number) as [number, number];
  const from = fromLocal(zone, y, m, 1, 0, 0);
  const to = fromLocal(zone, m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1, 0, 0);
  const incidents = engine.world.incidents
    .filter((i) => i.openedAt >= from && i.openedAt < Math.min(to, now))
    .sort((a, z) => a.openedAt - z.openedAt)
    .map((i) => {
      const b = buildingById.get(i.buildingId)!;
      const p = localParts(i.openedAt, b.zone);
      const businessHours = p.weekday >= 1 && p.weekday <= 5 && p.hour >= 8 && p.hour < 18;
      const ackMin = i.acknowledgedAt !== null && i.acknowledgedBy !== null ? Math.round((i.acknowledgedAt - i.openedAt) / MINUTE) : null;
      return { ...incidentSummary(engine, i, now), ackMin, businessHours };
    });
  const water = incidents.reduce((s, i) => s + (i.waterLostL ?? 0), 0);
  const acked = incidents.filter((i) => i.ackMin !== null);
  const slowestInc = [...acked].sort((a, z) => z.ackMin! - a.ackMin!)[0];
  const largest = [...incidents].filter((i) => i.waterLostL).sort((a, z) => z.waterLostL! - a.waterLostL!)[0];
  const cats = new Map<IncidentCategory, { count: number; critical: number; waterLostL: number }>();
  const blds = new Map<string, { count: number; critical: number; waterLostL: number }>();
  for (const i of incidents) {
    const c = cats.get(i.category) ?? { count: 0, critical: 0, waterLostL: 0 };
    c.count++;
    if (i.peakSeverity === "critical") c.critical++;
    c.waterLostL += i.waterLostL ?? 0;
    cats.set(i.category, c);
    const b = blds.get(i.buildingId) ?? { count: 0, critical: 0, waterLostL: 0 };
    b.count++;
    if (i.peakSeverity === "critical") b.critical++;
    b.waterLostL += i.waterLostL ?? 0;
    blds.set(i.buildingId, b);
  }
  // months with history: the window starts in August 2026
  const months: MonthlyReport["months"] = [];
  const nowP = localParts(now, zone);
  for (let k = 0; k < 4; k++) {
    const mm = ((nowP.month - 1 - k + 12) % 12) + 1;
    const yy = nowP.month - k <= 0 ? nowP.year - 1 : nowP.year;
    months.push({ value: `${yy}-${String(mm).padStart(2, "0")}`, label: `${MONTHS[mm - 1]} ${yy}${k === 0 ? ", to date" : ""}` });
  }
  return {
    organisation: ORGANISATION.name,
    month,
    label: `${MONTHS[m - 1]} ${y}`,
    from,
    to,
    zone,
    preparedAt: now,
    tariffPerKL: engine.tariffPerKL,
    incidents,
    totals: {
      incidents: incidents.length,
      critical: incidents.filter((i) => i.peakSeverity === "critical").length,
      falseAlarms: incidents.filter((i) => i.resolution === "false-alarm").length,
      buildingsAffected: new Set(incidents.map((i) => i.buildingId)).size,
      waterLostL: water,
      costAUD: Math.round((water / 1000) * engine.tariffPerKL * 100) / 100,
      medianAckBusinessMin: median(acked.filter((i) => i.businessHours).map((i) => i.ackMin!)),
      medianAckAfterMin: median(acked.filter((i) => !i.businessHours).map((i) => i.ackMin!)),
      slowest: slowestInc ? { incidentId: slowestInc.id, buildingName: slowestInc.buildingName, ackMin: slowestInc.ackMin! } : null,
      largestLoss: largest ? { incidentId: largest.id, buildingName: largest.buildingName, litres: largest.waterLostL! } : null,
    },
    byCategory: [...cats.entries()].map(([category, v]) => ({ category, label: INCIDENT_CATEGORY_LABEL[category], ...v })).sort((a, z) => z.count - a.count || a.label.localeCompare(z.label)),
    byBuilding: BUILDINGS.filter((b) => blds.has(b.id)).map((b) => ({ buildingId: b.id, name: b.name, ...blds.get(b.id)! })).sort((a, z) => z.count - a.count || a.name.localeCompare(z.name)),
    months,
  };
}
