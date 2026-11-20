import { useEffect } from "react";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "@/shell/AppShell";
import { Pending } from "@/features/Pending";
import { SymbolsPage } from "@/dev/SymbolsPage";
import { BuildingPage } from "@/features/building/BuildingPage";
import { PortfolioPage } from "@/features/portfolio/PortfolioPage";
import { IncidentsPage } from "@/features/incidents/IncidentsPage";
import { DevicesPage } from "@/features/devices/DevicesPage";
import { DeviceDetailPage } from "@/features/devices/DeviceDetailPage";
import { WaterPage } from "@/features/water/WaterPage";
import { IncidentDetailPage } from "@/features/incidents/IncidentDetailPage";
import { TokensPage } from "@/dev/TokensPage";
import { applyDocumentPrefs, useUi } from "@/state/ui";
import { startRuntime } from "@/mock/runtime";
import { useLiveUpdates } from "@/api/live";

startRuntime();

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/portfolio" replace /> },
      { path: "portfolio", element: <PortfolioPage /> },
      { path: "buildings/:id", element: <BuildingPage /> },
      { path: "incidents", element: <IncidentsPage /> },
      { path: "incidents/:id", element: <IncidentDetailPage /> },
      {
        path: "logbook",
        element: <Pending title="Logbook" job="Everything that happened and who did it, append-only." milestone="M6" />,
      },
      { path: "devices", element: <DevicesPage /> },
      { path: "devices/:id", element: <DeviceDetailPage /> },
      { path: "water", element: <WaterPage /> },
      {
        path: "reports/*",
        element: <Pending title="Reports" job="Monthly portfolio and single-incident reports for owners and insurers." milestone="M6" />,
      },
      {
        path: "settings/*",
        element: <Pending title="Settings" job="Escalation, rules, people, integrations, plan and billing." milestone="M8" />,
      },
      { path: "dev/symbols", element: <SymbolsPage /> },
      { path: "dev/tokens", element: <TokensPage /> },
      {
        path: "*",
        element: <Pending title="Page not found" job="This link does not match any screen. Use the navigation above." milestone="no milestone" />,
      },
    ],
  },
  {
    path: "/m/respond/:incidentId",
    element: <Pending title="Respond" job="Phone view opened from an SMS link." milestone="M7" />,
  },
  {
    path: "/m/commission",
    element: <Pending title="Commission a device" job="Phone view for installers." milestone="M7" />,
  },
]);

function Live() {
  useLiveUpdates();
  return null;
}

export function App() {
  const theme = useUi((s) => s.theme);
  const density = useUi((s) => s.density);
  useEffect(() => applyDocumentPrefs(theme, density), [theme, density]);

  return (
    <QueryClientProvider client={queryClient}>
      <Live />
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
