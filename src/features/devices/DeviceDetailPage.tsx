/** /devices/:id: the full record of one device. */
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCommand, useDevice, useSeries } from "@/api/queries";
import type { DeviceDetail } from "@/api/types";
import { Button } from "@/components/Button";
import { TimeChart } from "@/components/charts/TimeChart";
import { StatusLabel } from "@/components/status/StatusGlyph";
import { Tag } from "@/components/Tag";
import { DAY, formatAgo, formatDate, formatDateTime, formatNumber, formatTimeZoned } from "@/lib/format";
import { useSimNow } from "@/state/clock";
import { useUi } from "@/state/ui";
import styles from "./DeviceDetailPage.module.css";

const COLOR: Record<string, string> = { flow: "var(--jade)", level: "var(--jade)", pressure: "var(--gauge)", temperature: "var(--thermal)", wet: "var(--jade)", door: "var(--ink)", valve: "var(--ink)", duty: "var(--ink)" };

export function DeviceDetailPage() {
  const { id } = useParams();
  const { data, isPending, isError } = useDevice(id);
  const now = useSimNow();
  const main = data?.device.readings.find((r) => r.measure !== "current") ?? data?.device.readings[0];
  const series = useSeries(data && main ? `${data.device.id}/${main.measure}` : undefined, { spanMs: DAY }, 300);
  if (isPending) return <div className={styles.page} aria-busy><p className="soft">Loading the device record</p></div>;
  if (isError || !data) {
    return (
      <div className={styles.page}>
        <h1 className="t-title">Device not found</h1>
        <p className="t-prose">No device matches this link. It may have been replaced; search the device registry.</p>
        <Link to="/devices">Open the device registry</Link>
      </div>
    );
  }
  const d = data.device;
  const z = data.zone;
  const binary = main && ["wet", "door", "valve"].includes(main.measure);
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>
          <Tag>{d.tag}</Tag>
          <span>{d.kindLabel}</span>
          {d.alert ? <StatusLabel status={d.alert} /> : d.status === "offline" ? <StatusLabel status="offline" /> : d.status === "muted" ? <StatusLabel status="muted" /> : d.status === "paused" ? <span>Paused: gateway offline</span> : <span className="soft">Reporting</span>}
        </p>
        <h1 className="t-title">{d.name ?? d.location}</h1>
        <p className={styles.where}>
          <Link to={`/buildings/${d.buildingId}?inspect=device:${encodeURIComponent(d.id)}`}>{data.buildingName}</Link>, {data.levelLabel}
          {data.systemName ? `, ${data.systemName}` : ""}. {d.name ? d.location : ""}
        </p>
      </header>

      <div className={styles.columns}>
        <dl className={styles.facts}>
          <dt>Model</dt>
          <dd>{d.model}</dd>
          <dt>DevEUI</dt>
          <dd className="t-id">{d.devEui}</dd>
          <dt>Firmware</dt>
          <dd>{d.firmware}{d.firmwareLatest ? ", current" : ", one release behind"}</dd>
          <dt>Link</dt>
          <dd>{d.link}{d.gatewayTag ? ` via ${d.gatewayTag}` : ""}</dd>
          <dt>Installed</dt>
          <dd>{formatDate(data.installedAt, z)} by {data.installer}{data.replacedAt ? `. Replaced ${formatDateTime(data.replacedAt, z, { year: false })}` : ""}</dd>
          <dt>Calibrated</dt>
          <dd>{data.calibratedAt ? formatDate(data.calibratedAt, z) : "Not applicable"}</dd>
          <dt>Last uplink</dt>
          <dd>{d.lastUplink ? `${formatDateTime(d.lastUplink, z, { year: false, seconds: true })}, ${formatAgo(now - d.lastUplink)}` : "None in the last 4 days"}</dd>
          <dt>Uplinks lost</dt>
          <dd>{formatNumber(data.lossRatePct, 1)}% in normal running</dd>
        </dl>
        <section className={styles.section}>
          <h2 className="t-section">Thresholds applied</h2>
          {data.rules.length ? (
            <ul className={styles.list}>
              {data.rules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : (
            <p className="soft">No alert rules apply to this device. It is monitored for health only.</p>
          )}
          {d.status === "muted" && <p>Muted{d.muteUntil ? ` until ${formatTimeZoned(d.muteUntil, z)}` : ""}: {d.muteReason}.</p>}
          <DeviceRecordActions data={data} />
        </section>
      </div>

      {series.data && main && (
        <TimeChart
          caption="Readings, last 24 hours"
          panels={[{ id: "v", title: d.kindLabel, unit: main.unit, color: COLOR[main.measure] ?? "var(--ink)", kind: binary ? "state" : "line", states: main.measure === "wet" ? ["Dry", "Wet"] : main.measure === "door" ? ["Closed", "Open"] : ["Open", "Closed"], points: series.data.points, gaps: series.data.gaps, decimals: main.measure === "pressure" || main.measure === "level" ? 0 : 1, yMin: ["flow", "duty", "level", "pressure"].includes(main.measure) ? 0 : undefined }]}
          from={now - DAY}
          to={now}
          zone={z}
          overnight={main.measure === "flow"}
          panelHeight={120}
        />
      )}
      <div className={styles.columns}>
        <TimeChart
          caption="Battery, last 90 days"
          panels={[{ id: "b", title: "Battery", unit: "%", color: "var(--ink)", points: data.battery, decimals: 1, thresholds: [{ value: 20, label: "Replace below 20%" }], yMin: 0 }]}
          from={data.battery[0]![0]}
          to={data.battery[data.battery.length - 1]![0]}
          zone={z}
          panelHeight={110}
        />
        <TimeChart
          caption="Signal, last 7 days, hourly"
          panels={[
            { id: "r", title: "RSSI", unit: "dBm", color: "var(--ink)", points: data.signal.map(([t, r]) => [t, r]), decimals: 0, thresholds: [{ value: -110, label: "Weak below -110 dBm" }], gaps: data.gaps },
            { id: "s", title: "SNR", unit: "dB", color: "var(--ink-soft)", points: data.signal.map(([t, , s]) => [t, s]), decimals: 1 },
          ]}
          from={data.signal[0]![0]}
          to={data.signal[data.signal.length - 1]![0]}
          zone={z}
          panelHeight={80}
        />
      </div>

      <section className={styles.section}>
        <h2 className="t-section">Last 20 uplinks</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Received</th>
              <th scope="col">Values</th>
              <th scope="col" className={styles.num}>RSSI</th>
              <th scope="col" className={styles.num}>SNR</th>
              <th scope="col" className={styles.num}>Battery</th>
            </tr>
          </thead>
          <tbody>
            {data.uplinks.map((u) => (
              <tr key={u.at}>
                <td>{formatDateTime(u.at, z, { year: false, seconds: true })}</td>
                <td>{u.values}</td>
                <td className={styles.num}>{u.rssi} dBm</td>
                <td className={styles.num}>{formatNumber(u.snr, 1)} dB</td>
                <td className={styles.num}>{formatNumber(u.battery, 1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.uplinks.length && <p className="soft">No uplinks received recently. The device may be offline or out of range of its gateway.</p>}
      </section>
    </div>
  );
}

function DeviceRecordActions({ data }: { data: DeviceDetail }) {
  const d = data.device;
  const by = useUi((s) => s.role);
  const now = useSimNow();
  const cmd = useCommand();
  const [panel, setPanel] = useState<null | "rename" | "move" | "replace" | "mute">(null);
  const [text, setText] = useState("");
  const [hours, setHours] = useState("2");
  const [done, setDone] = useState<string | null>(null);
  const go = (c: Parameters<typeof cmd.mutate>[0], msg: string) => cmd.mutate(c, { onSuccess: () => (setDone(msg), setPanel(null), setText("")) });
  const open = (p: typeof panel, initial = "") => {
    setPanel(panel === p ? null : p);
    setText(initial);
    setDone(null);
  };
  return (
    <div className={styles.actions}>
      <div className={styles.row}>
        <Button onClick={() => open("rename", d.name ?? "")}>Rename</Button>
        <Button onClick={() => open("move", d.location)}>Move</Button>
        <Button onClick={() => open("replace")}>Replace</Button>
        <Button onClick={() => go({ type: "test-alert", deviceId: d.id, by }, "Test alert sent.")}>Send test alert</Button>
        {d.status === "muted" ? <Button onClick={() => go({ type: "unmute", deviceIds: [d.id], by }, "Unmuted.")}>Unmute</Button> : <Button onClick={() => open("mute")}>Mute</Button>}
      </div>
      {panel && (
        <form
          className={styles.panel}
          onSubmit={(e) => {
            e.preventDefault();
            if (panel === "rename") go({ type: "rename-device", deviceId: d.id, name: text, by }, `Renamed ${d.tag}.`);
            if (panel === "move") go({ type: "move-device", deviceId: d.id, location: text, by }, `Moved ${d.tag}.`);
            if (panel === "replace") go({ type: "replace-device", deviceId: d.id, reason: text, by }, `Replaced ${d.tag}.`);
            if (panel === "mute") go({ type: "mute", deviceIds: [d.id], until: now + Number(hours) * 3600_000, reason: text, by }, `Muted ${d.tag}.`);
          }}
        >
          {panel === "mute" && (
            <label className={styles.field}>
              <span>Mute for</span>
              <select value={hours} onChange={(e) => setHours(e.target.value)}>
                {["1", "2", "4", "8", "24"].map((h) => (
                  <option key={h} value={h}>
                    {h} {h === "1" ? "hour" : "hours"}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className={styles.field}>
            <span>{panel === "rename" ? "Name" : panel === "move" ? "New location" : panel === "replace" ? "Why it was replaced (required)" : "Reason (required)"}</span>
            <input value={text} onChange={(e) => setText(e.target.value)} required />
          </label>
          {panel === "replace" && <p className="t-small">The tag stays {d.tag}; the new unit gets its own DevEUI and history continues on the same record.</p>}
          {panel === "mute" && <p className="t-small">Alerts pause until {formatTimeZoned(now + Number(hours) * 3600_000, data.zone)}. Readings keep recording.</p>}
          <div className={styles.row}>
            <Button type="submit" variant="primary">
              {panel === "rename" ? "Rename" : panel === "move" ? "Move" : panel === "replace" ? "Replace" : "Mute"}
            </Button>
            <Button variant="quiet" onClick={() => setPanel(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {done && <p role="status">{done}</p>}
      {cmd.isError && <p className={styles.error} role="alert">{(cmd.error as Error).message}</p>}
    </div>
  );
}
