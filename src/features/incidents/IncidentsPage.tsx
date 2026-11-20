/** /incidents: is it being handled? Grouped by state, with filters. */
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useIncidents, usePortfolioStatus } from "@/api/queries";
import type { IncidentSummary } from "@/api/types";
import { Segmented } from "@/components/Button";
import { DataTable, type SortState } from "@/components/table/DataTable";
import { INCIDENT_CATEGORY_LABEL, type IncidentCategory } from "@/domain/building";
import { formatNumber } from "@/lib/format";
import { useNarrow, usePhone } from "@/lib/useMedia";
import { incidentColumns } from "@/features/building/tabs";
import { parseScope, useInspect } from "@/shell/url";
import { useSimNow } from "@/state/clock";
import styles from "./IncidentsPage.module.css";

type Sev = "all" | "critical" | "warning";

export function IncidentsPage() {
  const [params, setParams] = useSearchParams();
  const scope = parseScope(params.get("scope"));
  const { data, isPending, isError, refetch } = useIncidents(undefined, scope.kind === "building" ? scope.id : undefined);
  const portfolio = usePortfolioStatus();
  const now = useSimNow();
  const phone = usePhone();
  const narrow = useNarrow();
  const { open, target } = useInspect();
  const sev = (params.get("severity") as Sev) || "all";
  const category = params.get("category") ?? "";
  const q = params.get("q") ?? "";
  const [sorts, setSorts] = useState<Record<string, SortState>>({});
  const set = (k: string, v: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (!v || v === "all") n.delete(k);
        else n.set(k, v);
        return n;
      },
      { replace: true },
    );

  if (isPending) return <div className={styles.page} aria-busy><h1 className="t-title">Incidents</h1><p className="soft">Loading incidents</p></div>;
  if (isError || !data) {
    return (
      <div className={styles.page}>
        <h1 className="t-title">Incidents</h1>
        <p>Incidents could not be loaded. Alerts are still being raised and sent.</p>
        <button type="button" className={styles.retry} onClick={() => void refetch()}>Try again</button>
      </div>
    );
  }

  const stateOf = (b: string) => portfolio.data?.buildings.find((x) => x.id === b)?.state;
  let list = data;
  if (scope.kind === "state") list = list.filter((i) => stateOf(i.buildingId) === scope.id);
  if (sev !== "all") list = list.filter((i) => i.peakSeverity === sev);
  if (category) list = list.filter((i) => i.category === category);
  if (q) {
    const needle = q.toLowerCase();
    list = list.filter((i) => `${i.id} ${i.buildingName} ${i.title} ${i.location}`.toLowerCase().includes(needle));
  }
  const groups: Array<{ key: string; title: string; rows: IncidentSummary[]; empty: string }> = [
    { key: "open", title: "Open, not acknowledged", rows: list.filter((i) => i.state === "open"), empty: "Nothing waiting for acknowledgement." },
    { key: "ack", title: "Acknowledged and dispatched", rows: list.filter((i) => i.state === "acknowledged" || i.state === "dispatched"), empty: "No incidents are being worked on." },
    { key: "resolved", title: "Resolved, last 90 days", rows: list.filter((i) => i.state === "resolved"), empty: "No resolved incidents match these filters." },
  ];
  // cross-building lists show the viewer's zone, always with its abbreviation
  const viewerZone = portfolio.data?.organisation.viewerZone ?? "Australia/Sydney";
  const zoneOf = (_i: IncidentSummary) => viewerZone;
  const allCols = incidentColumns(now, zoneOf, true);
  const cols = phone
    ? allCols.filter((c) => ["sev", "id", "what", "state"].includes(c.key))
    : narrow
      ? allCols.filter((c) => !["water", "dur"].includes(c.key))
      : allCols;
  const water = list.filter((i) => i.state === "resolved").reduce((s, i) => s + (i.waterLostL ?? 0), 0);

  return (
    <div className={styles.page}>
      <h1 className="t-title">Incidents</h1>
      <div className={styles.filters}>
        <Segmented<Sev>
          label="Severity"
          value={sev}
          onChange={(v) => set("severity", v)}
          options={[
            { value: "all", label: "All" },
            { value: "critical", label: "Critical" },
            { value: "warning", label: "Warning" },
          ]}
        />
        <label className={styles.field}>
          <span className="visually-hidden">Type</span>
          <select value={category} onChange={(e) => set("category", e.target.value)}>
            <option value="">All types</option>
            {(Object.keys(INCIDENT_CATEGORY_LABEL) as IncidentCategory[]).map((c) => (
              <option key={c} value={c}>
                {INCIDENT_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className="visually-hidden">Search incidents</span>
          <input type="search" placeholder="Search by building, incident or place" value={q} onChange={(e) => set("q", e.target.value)} />
        </label>
        {scope.kind !== "organisation" && (
          <span className="t-small">
            Scoped to {scope.kind === "state" ? scope.id : portfolio.data?.buildings.find((b) => b.id === scope.id)?.name} from the list of buildings.
          </span>
        )}
      </div>
      {groups.map((g) => (
        <section key={g.key} className={styles.group} aria-labelledby={`h-${g.key}`}>
          <h2 id={`h-${g.key}`} className="t-section">
            {g.title} <span className={styles.count}>{formatNumber(g.rows.length)}</span>
          </h2>
          {g.key === "resolved" && g.rows.length > 0 && (
            <p className="t-small">Metered water lost across these incidents: {formatNumber(water / 1000, 2)} kL. Leaks seen only by a leak sensor are not metered.</p>
          )}
          {g.rows.length ? (
            <DataTable
              caption={g.title}
              columns={cols}
              rows={g.rows}
              rowKey={(i) => i.id}
              sort={sorts[g.key] ?? { key: "opened", dir: "desc" }}
              onSort={(s) => setSorts((x) => ({ ...x, [g.key]: s }))}
              selectedKey={target?.type === "incident" ? target.id : null}
              onSelect={(i) => open("incident", i.id)}
            />
          ) : (
            <p className="soft">{g.empty}</p>
          )}
        </section>
      ))}
    </div>
  );
}
