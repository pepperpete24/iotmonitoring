/** The building screen's tabs. */
import { useState } from "react";
import { Link } from "react-router-dom";
import type { BuildingDetail, DeviceLive, IncidentSummary } from "@/api/types";
import { useLogbook, useSeries } from "@/api/queries";
import { Segmented } from "@/components/Button";
import { type ChartEvent, type ChartPanel, TimeChart } from "@/components/charts/TimeChart";
import { StatusGlyph, StatusLabel } from "@/components/status/StatusGlyph";
import { Tag } from "@/components/Tag";
import { type Column, DataTable } from "@/components/table/DataTable";
import { Value } from "@/components/Value";
import { DAY, formatAgo, formatDateTime, formatDuration, formatNumber, formatTimeZoned, type Unit } from "@/lib/format";
import { useInspect } from "@/shell/url";
import { useSimNow } from "@/state/clock";
import styles from "./tabs.module.css";

// ---- Overview: live values by system ---------------------------------------------

function primaryReading(d: DeviceLive) {
  return d.readings.find((r) => r.measure !== "current") ?? d.readings[0];
}

function ReadingCell({ d }: { d: DeviceLive }) {
  if (d.status === "offline") return <span className="soft">Offline</span>;
  if (d.kind === "gateway") return <span>{d.status === "paused" ? "Offline" : "Online"}</span>;
  const r = primaryReading(d);
  if (!r) return <span className="soft">No reading</span>;
  if (r.measure === "wet") return <span>{r.value ? "Wet" : "Dry"}</span>;
  if (r.measure === "door") return <span>{r.value ? "Open" : "Closed"}</span>;
  if (r.measure === "valve") return <span>{r.value ? "Closed" : "Open"}</span>;
  return <Value value={r.value} unit={r.unit as Unit} decimals={r.measure === "pressure" || r.measure === "level" || r.measure === "duty" ? 0 : 1} />;
}

function statusOf(d: DeviceLive) {
  if (d.alert) return <StatusLabel status={d.alert} />;
  if (d.status === "offline") return <StatusLabel status="offline" />;
  if (d.status === "muted") return <StatusLabel status="muted" />;
  if (d.status === "paused") return <span className="soft">Paused, gateway offline</span>;
  return null;
}

function deviceColumns(zone: string, now: number): Column<DeviceLive>[] {
  return [
    { key: "tag", header: "Tag", width: 96, render: (d) => <Tag>{d.tag}</Tag>, sortValue: (d) => d.tag },
    { key: "kind", header: "Device", render: (d) => d.kindLabel, sortValue: (d) => d.kindLabel },
    { key: "where", header: "Location", render: (d) => d.location },
    { key: "status", header: "Status", render: statusOf, sortValue: (d) => (d.alert === "critical" ? 0 : d.alert ? 1 : d.status === "offline" ? 2 : d.status === "muted" ? 3 : 4) },
    { key: "value", header: "Reading", align: "num", render: (d) => <ReadingCell d={d} /> },
    {
      key: "last",
      header: "Last reading",
      align: "num",
      render: (d) => (d.lastUplink ? (now - d.lastUplink > 3600_000 ? formatAgo(now - d.lastUplink) : formatTimeZoned(d.lastUplink, zone)) : "None"),
      sortValue: (d) => d.lastUplink ?? 0,
    },
  ];
}

export function OverviewTab({ b }: { b: BuildingDetail }) {
  const now = useSimNow();
  const { open, target } = useInspect();
  const groups: Array<{ title: string; devices: DeviceLive[] }> = [];
  for (const s of [...b.systems].sort((a, z) => a.lane - z.lane)) {
    const devices = b.devices.filter((d) => d.systemId === s.id);
    if (devices.length) groups.push({ title: s.name, devices });
  }
  const loose = b.devices.filter((d) => d.systemId === null);
  if (loose.length) groups.push({ title: "Pits, floors and rooms", devices: loose });
  const cols = deviceColumns(b.summary.zone, now).filter((c) => c.key !== "kind");
  return (
    <div className={styles.stack}>
      {groups.map((g) => (
        <section key={g.title} className={styles.group}>
          <h2 className="t-section">{g.title}</h2>
          <DataTable
            caption={g.title}
            columns={cols}
            rows={g.devices}
            rowKey={(d) => d.id}
            selectedKey={target?.type === "device" ? target.id : null}
            onSelect={(d) => open("device", d.id)}
          />
        </section>
      ))}
    </div>
  );
}

// ---- Charts -------------------------------------------------------------------------

const RANGES = [
  { value: "1", label: "24 h" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
] as const;

export function incidentEvents(incidents: IncidentSummary[], from: number, to: number): ChartEvent[] {
  const ev: ChartEvent[] = [];
  for (const i of incidents) {
    const escalated = i.peakSeverity === "critical" && i.severitySince > i.openedAt;
    if (i.openedAt >= from && i.openedAt <= to) ev.push({ t: i.openedAt, label: `${i.id} raised`, status: escalated ? "warning" : i.peakSeverity });
    if (escalated && i.severitySince >= from && i.severitySince <= to) ev.push({ t: i.severitySince, label: `${i.id} critical`, status: "critical" });
    if (i.acknowledgedAt && i.acknowledgedAt >= from && i.acknowledgedAt <= to) ev.push({ t: i.acknowledgedAt, label: `${i.id} acknowledged` });
    if (i.resolvedAt && i.resolvedAt >= from && i.resolvedAt <= to) ev.push({ t: i.resolvedAt, label: `${i.id} resolved` });
  }
  return ev.sort((a, z) => a.t - z.t);
}

export function ChartsTab({ b }: { b: BuildingDetail }) {
  const now = useSimNow();
  const [days, setDays] = useState<"1" | "7" | "30">("1");
  const span = Number(days) * DAY;
  const pick = (kind: string, pref?: (d: DeviceLive) => boolean) => b.devices.filter((d) => d.kind === kind).find(pref ?? (() => true)) ?? b.devices.find((d) => d.kind === kind);
  const flow = pick("flow-meter", (d) => d.tag === "FT-01");
  const pressure = pick("pressure-sensor", (d) => d.tag === "PT-01");
  const pump = b.devices.filter((d) => d.kind === "pump-monitor" && !d.location.toLowerCase().includes("circulating")).sort((a, z) => (z.readings.find((r) => r.measure === "duty")?.value ?? 0) - (a.readings.find((r) => r.measure === "duty")?.value ?? 0))[0];
  const temp = pick("temperature-probe", (d) => d.location.toLowerCase().includes("cool room")) ?? pick("temperature-probe");
  const points = 400;
  const fs = useSeries(flow ? `${flow.id}/flow` : undefined, { spanMs: span }, points);
  const ps = useSeries(pressure ? `${pressure.id}/pressure` : undefined, { spanMs: span }, points);
  const us = useSeries(pump ? `${pump.id}/duty` : undefined, { spanMs: span }, points);
  const ts = useSeries(temp ? `${temp.id}/temperature` : undefined, { spanMs: span }, points);
  const panels: ChartPanel[] = [];
  if (fs.data && flow) panels.push({ id: "flow", title: `Flow, ${flow.tag}`, unit: "L/min", color: "var(--jade)", points: fs.data.points, gaps: fs.data.gaps, yMin: 0 });
  if (ps.data && pressure) panels.push({ id: "pressure", title: `Pressure, ${pressure.tag}, ${pressure.location}`, unit: "kPa", color: "var(--gauge)", points: align(ps.data.points, fs.data?.points), gaps: ps.data.gaps, decimals: 0, thresholds: [{ value: 200, label: "Minimum 200 kPa" }] });
  if (us.data && pump) panels.push({ id: "duty", title: `Pump duty, ${pump.tag}`, unit: "%", color: "var(--ink)", points: align(us.data.points, fs.data?.points), gaps: us.data.gaps, decimals: 0, yMin: 0 });
  if (ts.data && temp) {
    const cool = temp.location.toLowerCase().includes("cool room");
    panels.push({ id: "temp", title: `Temperature, ${temp.tag}, ${temp.location}`, unit: "°C", color: "var(--thermal)", points: align(ts.data.points, fs.data?.points), gaps: ts.data.gaps, thresholds: cool ? [{ value: 5, label: "Limit 5 °C" }] : temp.location.toLowerCase().includes("hot water") ? [{ value: 55, label: "Minimum 55 °C" }] : [] });
  }
  const from = now - span;
  return (
    <div className={styles.stack}>
      <div className={styles.filters}>
        <Segmented label="Time range" value={days} onChange={setDays} options={RANGES} />
        <span className="t-small">Times in {formatTimeZoned(now, b.summary.zone).split(" ")[1]}, the building's local time.</span>
      </div>
      {panels.length ? (
        <TimeChart
          caption={`${b.summary.name}, last ${RANGES.find((r) => r.value === days)!.label}`}
          panels={panels}
          from={from}
          to={now}
          zone={b.summary.zone}
          overnight
          events={incidentEvents(b.incidents, from, now)}
          stale={fs.isFetching && !fs.isPending}
        />
      ) : (
        <p className="soft">Loading readings</p>
      )}
    </div>
  );
}

/** Put a series on the first panel's time points, so one cursor reads every panel. */
function align(points: Array<[number, number | null]>, base?: Array<[number, number | null]>): Array<[number, number | null]> {
  if (!base || !points.length) return points;
  let j = 0;
  return base.map(([t]) => {
    while (j < points.length - 1 && Math.abs(points[j + 1]![0] - t) <= Math.abs(points[j]![0] - t)) j++;
    return [t, points[j]![1]];
  });
}

// ---- Devices -------------------------------------------------------------------------

export function DevicesTab({ b }: { b: BuildingDetail }) {
  const now = useSimNow();
  const { open, target } = useInspect();
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "status", dir: "asc" });
  const cols: Column<DeviceLive>[] = [
    ...deviceColumns(b.summary.zone, now),
    { key: "battery", header: "Battery", align: "num", render: (d) => `${formatNumber(d.battery, 1)}%`, sortValue: (d) => d.battery },
    { key: "rssi", header: "Signal", align: "num", render: (d) => `${d.rssi} dBm`, sortValue: (d) => d.rssi },
  ];
  return (
    <DataTable
      caption={`Devices at ${b.summary.name}`}
      columns={cols}
      rows={b.devices}
      rowKey={(d) => d.id}
      sort={sort}
      onSort={setSort}
      selectedKey={target?.type === "device" ? target.id : null}
      onSelect={(d) => open("device", d.id)}
    />
  );
}

// ---- Incidents ------------------------------------------------------------------------

export function incidentColumns(now: number, zoneOf: (i: IncidentSummary) => string, showBuilding = false): Column<IncidentSummary>[] {
  const stateWord = (i: IncidentSummary) =>
    i.state === "resolved" ? (i.resolution === "false-alarm" ? "False alarm" : "Resolved") : i.state === "open" ? "Not acknowledged" : i.state === "dispatched" ? "Dispatched" : "Acknowledged";
  return [
    { key: "sev", header: <span className="visually-hidden">Severity</span>, width: 28, render: (i) => <StatusGlyph status={i.peakSeverity} title={i.peakSeverity === "critical" ? "Critical" : "Warning"} /> },
    { key: "id", header: "Incident", width: 104, render: (i) => <Link to={`/incidents/${i.id}`} onClick={(e) => e.stopPropagation()}>{i.id}</Link>, sortValue: (i) => i.id },
    ...(showBuilding ? [{ key: "b", header: "Building", render: (i: IncidentSummary) => i.buildingName, sortValue: (i: IncidentSummary) => i.buildingName }] : []),
    { key: "what", header: "What and where", render: (i) => `${i.title}, ${i.location}` },
    { key: "state", header: "State", render: stateWord, sortValue: (i) => i.state },
    { key: "opened", header: "Opened", align: "num", render: (i) => formatDateTime(i.openedAt, zoneOf(i), { year: false }), sortValue: (i) => i.openedAt },
    {
      key: "dur",
      header: "Duration",
      align: "num",
      render: (i) => formatDuration((i.resolvedAt ?? now) - i.openedAt),
      sortValue: (i) => (i.resolvedAt ?? now) - i.openedAt,
    },
    { key: "water", header: "Water lost", align: "num", render: (i) => (i.waterLostL === null ? <span className="soft">Not metered</span> : <Value value={i.waterLostL / 1000} unit="kL" flash={false} />), sortValue: (i) => i.waterLostL ?? -1 },
  ];
}

export function IncidentsTab({ b }: { b: BuildingDetail }) {
  const now = useSimNow();
  const { open, target } = useInspect();
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "opened", dir: "desc" });
  if (!b.incidents.length) {
    return <p className={styles.empty}>No incidents in the last 90 days at this building. Alerts appear here the first time a device crosses a threshold.</p>;
  }
  return (
    <DataTable
      caption={`Incidents at ${b.summary.name}, last 90 days`}
      columns={incidentColumns(now, () => b.summary.zone)}
      rows={b.incidents}
      rowKey={(i) => i.id}
      sort={sort}
      onSort={setSort}
      selectedKey={target?.type === "incident" ? target.id : null}
      onSelect={(i) => open("incident", i.id)}
    />
  );
}

// ---- Maintenance ------------------------------------------------------------------------

const MAINT_ACTIONS = new Set(["muted", "unmuted", "auto-muted", "valve-closed", "valve-opened", "isolated", "device-offline", "device-online", "device-commissioned"]);

export function MaintenanceTab({ b }: { b: BuildingDetail }) {
  const { data } = useLogbook({ building: b.summary.id });
  const muted = b.devices.filter((d) => d.status === "muted");
  const entries = (data ?? []).filter((e) => MAINT_ACTIONS.has(e.action));
  return (
    <div className={styles.stack}>
      <section className={styles.group}>
        <h2 className="t-section">Muted now</h2>
        {muted.length ? (
          <ul className={styles.plainList}>
            {muted.map((d) => (
              <li key={d.id}>
                <StatusGlyph status="muted" size={12} /> <Tag>{d.tag}</Tag> {d.location}.{" "}
                <span className="soft">
                  {d.muteReason}
                  {d.muteUntil ? `, until ${formatTimeZoned(d.muteUntil, b.summary.zone)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="soft">No devices are muted. Mute a device from its record before maintenance so its alerts pause.</p>
        )}
      </section>
      <section className={styles.group}>
        <h2 className="t-section">Maintenance record</h2>
        {entries.length ? (
          <ol className={styles.log}>
            {entries.map((e) => (
              <li key={e.id}>
                <time className={styles.logTime}>{formatDateTime(e.at, b.summary.zone, { year: false })}</time>
                <span className={styles.logActor}>{e.actor}</span>
                <span>{e.detail}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="soft">No maintenance recorded in the last 90 days. Mutes, valve operations and devices going offline appear here.</p>
        )}
      </section>
    </div>
  );
}

// ---- Details ----------------------------------------------------------------------------

export function DetailsTab({ b }: { b: BuildingDetail }) {
  const s = b.summary;
  return (
    <div className={styles.columns}>
      <dl className={styles.facts}>
        <dt>Address</dt>
        <dd>
          {s.address}, {s.suburb} {s.state}
        </dd>
        <dt>Type</dt>
        <dd>{b.typeLabel}</dd>
        <dt>Size</dt>
        <dd>
          {b.campusBuildings ? `${b.campusBuildings} buildings` : `${b.levelsAbove} levels, ${b.basements} basements`}. {b.occupancy}
        </dd>
        <dt>Time zone</dt>
        <dd>{s.zone}</dd>
        <dt>Devices</dt>
        <dd>{formatNumber(s.devicesTotal)}</dd>
        <dt>Shut-off valve</dt>
        <dd>{b.valve ? `${b.valve.tag}. ${b.valve.isolation}` : "None fitted"}</dd>
        <dt>Systems</dt>
        <dd>{b.systems.filter((x) => x.type !== "network").map((x) => x.name).join(", ")}</dd>
      </dl>
      <section className={styles.group}>
        <h2 className="t-section">Contacts and roster</h2>
        <p className="soft">Critical alerts call these people in order, every 10 minutes, repeating hourly until someone acknowledges.</p>
        <ol className={styles.roster}>
          {b.contacts.map((c, i) => (
            <li key={c.name}>
              <span className={styles.step}>{i + 1}</span>
              <span>
                <strong>{c.name}</strong>
                <span className="soft">, {c.title}</span>
                <br />
                <span className="t-small">
                  {c.mobileMasked}, {c.email}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
