import { useEffect } from "react";
import { createBrowserRouter, Navigate, RouterProvider, useParams } from "react-router-dom";
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
import { RespondPage } from "@/features/mobile/RespondPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { CommissionPage } from "@/features/mobile/CommissionPage";
import { LogbookPage } from "@/features/logbook/LogbookPage";
import { MonthlyReportPage } from "@/features/reports/MonthlyReportPage";
import { IncidentReportPage } from "@/features/reports/IncidentReportPage";
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
      { path: "logbook", element: <LogbookPage /> },
      { path: "devices", element: <DevicesPage /> },
      { path: "devices/:id", element: <DeviceDetailPage /> },
      { path: "water", element: <WaterPage /> },
      { path: "reports", element: <Navigate to="/reports/monthly" replace /> },
      { path: "reports/monthly", element: <MonthlyReportPage /> },
      { path: "reports/incident/:id", element: <IncidentReportPage /> },
      { path: "settings", element: <Navigate to="/settings/escalation" replace /> },
      { path: "settings/:section", element: <SettingsPage /> },
      { path: "dev/symbols", element: <SymbolsPage /> },
      { path: "dev/tokens", element: <TokensPage /> },
      {
        path: "*",
        element: <Pending title="Page not found" job="This link does not match any screen. Use the navigation above." milestone="no milestone" />,
      },
    ],
  },
  { path: "/m/respond/:incidentId", element: <RespondPage /> },
  { path: "/r/:short", element: <ShortLink /> },
  { path: "/m/commission", element: <CommissionPage /> },
]);

/** The short link in an SMS: /r/0167 opens the responder view for I-2026-0167. */
function ShortLink() {
  const { short } = useParams();
  return <Navigate to={`/m/respond/I-2026-${short ?? ""}`} replace />;
}

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
