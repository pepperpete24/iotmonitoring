import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Command } from "@/mock/engine/engine";
import { transport } from "./transport";
import type { IncidentDetail, IncidentSummary, LogbookView, PortfolioStatus } from "./types";

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

/** Send a person's action. Every query refreshes once the engine has applied it. */
export function useCommand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cmd: Command) => transport.post<{ ok: true; at: number }>("/api/commands", cmd),
    onSettled: () => qc.invalidateQueries(),
  });
}
