import { useQuery } from "@tanstack/react-query";
import { transport } from "./transport";
import type { PortfolioStatus } from "./types";

export const queryKeys = {
  portfolioStatus: ["portfolio", "status"] as const,
};

export function usePortfolioStatus() {
  return useQuery({
    queryKey: queryKeys.portfolioStatus,
    queryFn: () => transport.get<PortfolioStatus>("/api/portfolio/status"),
    staleTime: 5_000,
  });
}
