import { lazy, Suspense, useEffect } from "react";
import { createBrowserRouter, Navigate, RouterProvider, useParams } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "@/shell/AppShell";
import { Pending } from "@/features/Pending";
import { BuildingPage } from "@/features/building/BuildingPage";
import { PortfolioPage } from "@/features/portfolio/PortfolioPage";
import { IncidentsPage } from "@/features/incidents/IncidentsPage";
import { IncidentDetailPage } from "@/features/incidents/IncidentDetailPage";
import { applyDocumentPrefs, useUi } from "@/state/ui";
import { startRuntime } from "@/mock/runtime";
import { useLiveUpdates } from "@/api/live";

// Screens away from the main demo path load on first visit.
const SymbolsPage = lazy(() => import("@/dev/SymbolsPage").then((m) => ({ default: m.SymbolsPage })));
const DevicesPage = lazy(() => import("@/features/devices/DevicesPage").then((m) => ({ default: m.DevicesPage })));
const DeviceDetailPage = lazy(() => import("@/features/devices/DeviceDetailPage").then((m) => ({ default: m.DeviceDetailPage })));
const WaterPage = lazy(() => import("@/features/water/WaterPage").then((m) => ({ default: m.WaterPage })));
const RespondPage = lazy(() => import("@/features/mobile/RespondPage").then((m) => ({ default: m.RespondPage })));
const SettingsPage = lazy(() => import("@/features/settings/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const CommissionPage = lazy(() => import("@/features/mobile/CommissionPage").then((m) => ({ default: m.CommissionPage })));
const LogbookPage = lazy(() => import("@/features/logbook/LogbookPage").then((m) => ({ default: m.LogbookPage })));
const MonthlyReportPage = lazy(() => import("@/features/reports/MonthlyReportPage").then((m) => ({ default: m.MonthlyReportPage })));
const IncidentReportPage = lazy(() => import("@/features/reports/IncidentReportPage").then((m) => ({ default: m.IncidentReportPage })));
const TokensPage = lazy(() => import("@/dev/TokensPage").then((m) => ({ default: m.TokensPage })));

/** Phone views load on their own; this is what shows for the moment they take. */
function PhoneLoading() {
  return <p style={{ padding: 16 }}>Opening</p>;
}

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
  { path: "/m/respond/:incidentId", element: <Suspense fallback={<PhoneLoading />}><RespondPage /></Suspense> },
  { path: "/r/:short", element: <ShortLink /> },
  { path: "/m/commission", element: <Suspense fallback={<PhoneLoading />}><CommissionPage /></Suspense> },
], { basename: import.meta.env.BASE_URL.replace(/\/$/, "") || "/" });

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
