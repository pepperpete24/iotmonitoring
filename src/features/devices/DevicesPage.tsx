/** /devices: can I trust the data? The registry of every device, with health filters. */
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { type DeviceRow, useDevices, usePortfolioStatus } from "@/api/queries";
import { StatusLabel } from "@/components/status/StatusGlyph";
import { Tag } from "@/components/Tag";
import { type Column, DataTable, type SortState } from "@/components/table/DataTable";
import { formatAgo, formatNumber } from "@/lib/format";
import { usePhone } from "@/lib/useMedia";
import { parseScope, useInspect } from "@/shell/url";
import { useSimNow } from "@/state/clock";
import styles from "./DevicesPage.module.css";

const FILTERS = [
  { key: "offline", label: "Offline", test: (d: DeviceRow) => d.status === "offline" || d.status === "paused" },
  { key: "battery", label: "Battery under 20%", test: (d: DeviceRow) => d.battery < 20 },
  { key: "signal", label: "Weak signal", test: (d: DeviceRow) => d.weakSignal },
  { key: "firmware", label: "Firmware behind", test: (d: DeviceRow) => !d.firmwareLatest },
  { key: "silent", label: "No reading in 24 h", test: (d: DeviceRow, now: number) => d.lastUplink === null || now - d.lastUplink > 86_400_000 },
  { key: "muted", label: "Muted", test: (d: DeviceRow) => d.status === "muted" },
] as const;

export function DevicesPage() {
  const [params, setParams] = useSearchParams();
  const scope = parseScope(params.get("scope"));
  const { data, isPending, isError, refetch } = useDevices(scope.kind === "building" ? scope.id : undefined);
  const portfolio = usePortfolioStatus();
  const now = useSimNow();
  const phone = usePhone();
  const { open, target } = useInspect();
  const active = new Set((params.get("filter") ?? "").split(",").filter(Boolean));
  const q = params.get("q") ?? "";
  const [sort, setSort] = useState<SortState>({ key: "status", dir: "asc" });
  const toggle = (k: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        const s = new Set(active);
        if (s.has(k)) s.delete(k);
        else s.add(k);
        if (s.size) n.set("filter", [...s].join(","));
        else n.delete("filter");
        return n;
      },
      { replace: true },
    );

  if (isPending) return <div className={styles.page} aria-busy><h1 className="t-title">Devices</h1><p className="soft">Loading 413 devices</p></div>;
  if (isError || !data) {
    return (
      <div className={styles.page}>
        <h1 className="t-title">Devices</h1>
        <p>The device registry could not be loaded. Devices are still reporting.</p>
        <button type="button" onClick={() => void refetch()}>Try again</button>
      </div>
    );
  }
  if (data.length === 0) {
    return (
      <div className={styles.page}>
        <h1 className="t-title">Devices</h1>
        <p className="t-prose soft">No devices yet. Each device appears here as the installer commissions it, with its signal and battery checked on site.</p>
      </div>
    );
  }
  const stateOf = (b: string) => portfolio.data?.buildings.find((x) => x.id === b)?.state;
  let rows = data;
  if (scope.kind === "state") rows = rows.filter((d) => stateOf(d.buildingId) === scope.id);
  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, rows.filter((d) => f.test(d, now)).length]));
  for (const f of FILTERS) if (active.has(f.key)) rows = rows.filter((d) => f.test(d, now));
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter((d) => `${d.tag} ${d.name ?? ""} ${d.buildingName} ${d.location} ${d.kindLabel} ${d.devEui}`.toLowerCase().includes(needle));
  }
  const statusRank = (d: DeviceRow) => (d.alert === "critical" ? 0 : d.alert ? 1 : d.status === "offline" ? 2 : d.status === "paused" ? 3 : d.status === "muted" ? 4 : 5);
  const columns: Column<DeviceRow>[] = [
    { key: "tag", header: "Tag", width: 96, sortValue: (d) => d.tag, render: (d) => <Link to={`/devices/${encodeURIComponent(d.id)}`} onClick={(e) => e.stopPropagation()} className={styles.tagLink}><Tag>{d.tag}</Tag></Link> },
    { key: "building", header: "Building", sortValue: (d) => d.buildingName, render: (d) => d.buildingName },
    { key: "kind", header: "Device", sortValue: (d) => d.kindLabel, render: (d) => (d.name ? `${d.name} (${d.kindLabel.toLowerCase()})` : d.kindLabel) },
    { key: "where", header: "Location", render: (d) => d.location },
    {
      key: "status",
      header: "Status",
      sortValue: statusRank,
      render: (d) =>
        d.alert ? <StatusLabel status={d.alert} /> : d.status === "offline" ? <StatusLabel status="offline" /> : d.status === "muted" ? <StatusLabel status="muted" /> : d.status === "paused" ? <span>Paused</span> : <span className="soft">Reporting</span>,
    },
    { key: "battery", header: "Battery", align: "num", sortValue: (d) => d.battery, render: (d) => <span className={d.battery < 20 ? styles.flag : undefined}>{formatNumber(d.battery, 1)}%</span> },
    { key: "rssi", header: "Signal", align: "num", sortValue: (d) => d.rssi, render: (d) => <span className={d.weakSignal ? styles.flag : undefined}>{d.rssi} dBm{d.weakSignal ? ", weak" : ""}</span> },
    { key: "fw", header: "Firmware", align: "num", sortValue: (d) => d.firmware, render: (d) => <span className={d.firmwareLatest ? undefined : styles.flag}>{d.firmware}{d.firmwareLatest ? "" : ", behind"}</span> },
    { key: "last", header: "Last uplink", align: "num", sortValue: (d) => d.lastUplink ?? 0, render: (d) => (d.lastUplink ? formatAgo(now - d.lastUplink) : "Over 4 days") },
  ];
  const cols = phone ? columns.filter((c) => ["tag", "kind", "status"].includes(c.key)) : columns;
  return (
    <div className={styles.page}>
      <h1 className="t-title">Devices</h1>
      <p className="soft">
        {formatNumber(data.length)} devices. {formatNumber(rows.length)} shown.
      </p>
      <div className={styles.filters} role="group" aria-label="Show only">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" aria-pressed={active.has(f.key)} className={styles.filter} onClick={() => toggle(f.key)}>
            {f.label} <span className={styles.count}>{counts[f.key]}</span>
          </button>
        ))}
        <label>
          <span className="visually-hidden">Search devices</span>
          <input
            type="search"
            className={styles.search}
            placeholder="Search tag, building, place or DevEUI"
            value={q}
            onChange={(e) =>
              setParams(
                (p) => {
                  const n = new URLSearchParams(p);
                  if (e.target.value) n.set("q", e.target.value);
                  else n.delete("q");
                  return n;
                },
                { replace: true },
              )
            }
          />
        </label>
      </div>
      <DataTable
        caption="Device registry"
        columns={cols}
        rows={rows}
        rowKey={(d) => d.id}
        sort={sort}
        onSort={setSort}
        selectedKey={target?.type === "device" ? target.id : null}
        onSelect={(d) => open("device", d.id)}
        empty="No devices match these filters. Clear a filter to see more."
      />
    </div>
  );
}
