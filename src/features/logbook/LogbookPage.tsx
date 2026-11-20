/** /logbook: what happened, and who did what? Append-only, newest first. */
import { Link, useSearchParams } from "react-router-dom";
import { useLogbook, usePortfolioStatus } from "@/api/queries";
import type { LogbookView } from "@/api/types";
import { Button } from "@/components/Button";
import type { LogbookAction } from "@/domain/building";
import { formatDate, formatNumber, formatStamp, formatTimeZoned } from "@/lib/format";
import { parseScope } from "@/shell/url";
import styles from "./LogbookPage.module.css";

const TYPES: Array<{ value: string; label: string; actions: LogbookAction[] }> = [
  { value: "alerts", label: "Alerts and incidents", actions: ["alert-raised", "alert-cleared", "incident-opened", "severity-raised", "incident-escalated"] },
  { value: "notifications", label: "Notifications", actions: ["notification", "test-message"] },
  { value: "people", label: "People's actions", actions: ["acknowledged", "assigned", "dispatched", "arrived", "note", "photo", "resolved", "false-alarm"] },
  { value: "equipment", label: "Valves and mutes", actions: ["valve-closed", "valve-opened", "isolated", "muted", "unmuted", "auto-muted"] },
  { value: "devices", label: "Devices", actions: ["device-offline", "device-online", "device-commissioned"] },
  { value: "settings", label: "Settings and contacts", actions: ["contact-updated", "setting-changed"] },
];

/** RFC 4180 CSV with times in the viewer's zone, ready for a spreadsheet. */
function toCsv(rows: LogbookView[], zone: string): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const head = ["Time", "Building", "Actor", "Action", "Target", "Incident", "Detail"];
  return [head, ...rows.map((r) => [formatStamp(r.at, zone), r.buildingName ?? "", r.actor, r.action, r.target, r.incidentId ?? "", r.detail])].map((cols) => cols.map(esc).join(",")).join("\r\n");
}

export function LogbookPage() {
  const [params, setParams] = useSearchParams();
  const scope = parseScope(params.get("scope"));
  const building = params.get("building") ?? (scope.kind === "building" ? scope.id : "");
  const actor = params.get("actor") ?? "";
  const type = params.get("type") ?? "";
  const portfolio = usePortfolioStatus();
  const { data, isPending, isError, refetch } = useLogbook({ ...(building ? { building } : {}), ...(actor ? { actor } : {}), limit: "5000" });
  const zone = portfolio.data?.organisation.viewerZone ?? "Australia/Sydney";
  const set = (k: string, v: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v) n.set(k, v);
        else n.delete(k);
        return n;
      },
      { replace: true },
    );

  if (isPending) return <div className={styles.page} aria-busy><h1 className="t-title">Logbook</h1><p className="soft">Loading the record</p></div>;
  if (isError || !data) {
    return (
      <div className={styles.page}>
        <h1 className="t-title">Logbook</h1>
        <p>The Logbook could not be loaded. Nothing has been lost; every entry is kept.</p>
        <Button onClick={() => void refetch()}>Try again</Button>
      </div>
    );
  }
  const typeDef = TYPES.find((t) => t.value === type);
  let rows = typeDef ? data.filter((r) => typeDef.actions.includes(r.action)) : data;
  if (scope.kind === "state") {
    const ids = new Set(portfolio.data?.buildings.filter((b) => b.state === scope.id).map((b) => b.id));
    rows = rows.filter((r) => r.buildingId && ids.has(r.buildingId));
  }
  const actors = [...new Map(data.map((r) => [r.actorId, r.actor])).entries()].sort((a, z) => a[1].localeCompare(z[1]));
  const download = () => {
    const blob = new Blob([`﻿${toCsv(rows, zone)}`], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `logbook-${formatStamp(Date.now(), zone).slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  // group by local day
  const days: Array<{ day: string; rows: LogbookView[] }> = [];
  for (const r of rows) {
    const day = formatDate(r.at, zone);
    const last = days[days.length - 1];
    if (last && last.day === day) last.rows.push(r);
    else days.push({ day, rows: [r] });
  }
  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className="t-title">Logbook</h1>
        <Button onClick={download}>Export {formatNumber(rows.length)} entries as CSV</Button>
      </div>
      <p className="t-prose soft">Everything the platform did and everything people did, in order. Entries are never edited or removed. Times in {zone === "Australia/Sydney" ? "Sydney time" : zone}, with the zone shown.</p>
      <div className={styles.filters}>
        <label className={styles.field}>
          <span>Building</span>
          <select value={building} onChange={(e) => set("building", e.target.value)}>
            <option value="">All buildings</option>
            {portfolio.data?.buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Who</span>
          <select value={actor} onChange={(e) => set("actor", e.target.value)}>
            <option value="">Everyone</option>
            {actors.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Type</span>
          <select value={type} onChange={(e) => set("type", e.target.value)}>
            <option value="">Everything</option>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {rows.length === 0 ? (
        <p className="soft">No entries match. Entries appear as alerts are raised and people act on them.</p>
      ) : (
        days.slice(0, 40).map((d) => (
          <section key={d.day} className={styles.day} aria-label={d.day}>
            <h2 className={styles.dayHead}>{d.day}</h2>
            <ol className={styles.list}>
              {d.rows.map((r) => (
                <li key={r.id}>
                  <time className={styles.time} dateTime={new Date(r.at).toISOString()}>
                    {formatTimeZoned(r.at, zone)}
                  </time>
                  <span className={styles.actor}>{r.actor}</span>
                  <span className={styles.where}>{r.buildingName ?? ""}</span>
                  <span className={styles.detail}>
                    {r.detail}
                    {r.incidentId && (
                      <>
                        {" "}
                        <Link to={`/incidents/${r.incidentId}`}>{r.incidentId}</Link>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ))
      )}
      {days.length > 40 && <p className="soft">Showing the latest 40 days. The CSV export holds every entry that matches.</p>}
    </div>
  );
}
