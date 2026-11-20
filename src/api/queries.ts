import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Command } from "@/mock/engine/engine";
import { transport } from "./transport";
import type { MonthlyReport } from "@/mock/views-reports";
import type { DeviceDetail, DeviceLive, WaterView, BuildingDetail, IncidentDetail, IncidentSummary, LogbookView, PortfolioStatus, SeriesView } from "./types";

export const queryKeys = {
  portfolioStatus: ["portfolio", "status"] as const,
  incidents: (state?: string, building?: string) => ["incidents", "list", state ?? "", building ?? ""] as const,
  incident: (id: string) => ["incidents", "detail", id] as const,
  logbook: (filters: Record<string, string>) => ["logbook", filters] as const,
  people: ["people"] as const,
};

export function usePortfolioStatus() {
  return useQuery({
    queryKey: queryKeys.portfolioStatus,
    queryFn: () => transport.get<PortfolioStatus>("/api/portfolio/status"),
  });
}

export function useIncidents(state?: string, building?: string) {
  const q = new URLSearchParams();
  if (state) q.set("state", state);
  if (building) q.set("building", building);
  return useQuery({
    queryKey: queryKeys.incidents(state, building),
    queryFn: () => transport.get<IncidentSummary[]>(`/api/incidents?${q.toString()}`),
  });
}

export function useIncident(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.incident(id ?? ""),
    queryFn: () => transport.get<IncidentDetail>(`/api/incidents/${encodeURIComponent(id!)}`),
    enabled: !!id,
  });
}

export function useLogbook(filters: Record<string, string> = {}) {
  const q = new URLSearchParams(filters);
  return useQuery({
    queryKey: queryKeys.logbook(filters),
    queryFn: () => transport.get<LogbookView[]>(`/api/logbook?${q.toString()}`),
  });
}

export function useBuilding(id: string | undefined) {
  return useQuery({
    queryKey: ["buildings", id ?? ""],
    queryFn: () => transport.get<BuildingDetail>(`/api/buildings/${encodeURIComponent(id!)}`),
    enabled: !!id,
  });
}

/** Readings for one channel. `to` omitted means "up to now", refreshed live. */
export function useSeries(channelId: string | undefined, range: { from?: number; to?: number; spanMs?: number }, points = 400) {
  const key = range.from !== undefined ? `${range.from}-${range.to ?? "now"}` : `last-${range.spanMs ?? 86_400_000}`;
  return useQuery({
    queryKey: ["series", channelId ?? "", key, points],
    queryFn: () => {
      const q = new URLSearchParams({ channel: channelId!, points: String(points) });
      if (range.from !== undefined) q.set("from", String(range.from));
      else q.set("span", String(range.spanMs ?? 86_400_000));
      if (range.to !== undefined) q.set("to", String(range.to));
      return transport.get<SeriesView>(`/api/series?${q.toString()}`);
    },
    enabled: !!channelId,
    placeholderData: (prev) => prev,
  });
}

export type DeviceRow = DeviceLive & { buildingName: string; zone: string };

export function useDevices(building?: string) {
  return useQuery({
    queryKey: ["devices", "list", building ?? ""],
    queryFn: () => transport.get<DeviceRow[]>(`/api/devices${building ? `?building=${building}` : ""}`),
  });
}

export function useDevice(id: string | undefined) {
  return useQuery({
    queryKey: ["devices", "detail", id ?? ""],
    queryFn: () => transport.get<DeviceDetail>(`/api/devices/${encodeURIComponent(id!)}`),
    enabled: !!id,
  });
}

export function useWater(building?: string) {
  return useQuery({
    queryKey: ["water", building ?? ""],
    queryFn: () => transport.get<WaterView>(`/api/water${building ? `?building=${building}` : ""}`),
    placeholderData: (prev) => prev,
  });
}

export function useMonthlyReport(month: string) {
  return useQuery({
    queryKey: ["reports", "monthly", month],
    queryFn: () => transport.get<MonthlyReport>(`/api/reports/monthly?month=${month}`),
    placeholderData: (prev) => prev,
  });
}

export function useSms(personId: string | null) {
  return useQuery({
    queryKey: ["sms", personId ?? ""],
    queryFn: () => transport.get<Array<{ id: string; at: number; incidentId: string; body: string; result: string; detail: string }>>(`/api/sms?person=${personId}&limit=3`),
    enabled: !!personId,
  });
}

export function useNextTag(buildingId: string, kind: string, levelId: string) {
  return useQuery({
    queryKey: ["next-tag", buildingId, kind, levelId],
    queryFn: () => transport.get<{ tag: string }>(`/api/buildings/${buildingId}/next-tag?kind=${kind}&level=${encodeURIComponent(levelId)}`),
    enabled: !!buildingId && !!levelId,
  });
}

/** Send a person's action. Every query refreshes once the engine has applied it. */
export function useCommand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cmd: Command) => transport.post<{ ok: true; at: number }>("/api/commands", cmd),
    onSettled: () => qc.invalidateQueries(),
  });
}
