/** The inspector's view of one device: live value, 24 h chart, thresholds, health, alerts, actions. */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useBuilding, useCommand, useSeries } from "@/api/queries";
import type { BuildingDetail, DeviceLive } from "@/api/types";
import { Button } from "@/components/Button";
import { TimeChart } from "@/components/charts/TimeChart";
import { StatusLabel } from "@/components/status/StatusGlyph";
import { Tag } from "@/components/Tag";
import { Value } from "@/components/Value";
import { DAY, formatAgo, formatDateTime, formatNumber, formatTimeZoned, type Unit } from "@/lib/format";
import { useSimNow } from "@/state/clock";
import styles from "./Inspector.module.css";

const COLOR: Record<string, string> = { flow: "var(--jade)", level: "var(--jade)", pressure: "var(--gauge)", temperature: "var(--thermal)", wet: "var(--jade)", door: "var(--ink)", valve: "var(--ink)", duty: "var(--ink)" };

/** The thresholds the customer set that apply to this device. */
function thresholdsFor(d: DeviceLive): Array<{ value: number; label: string }> {
  const loc = d.location.toLowerCase();
  if (d.kind === "pressure-sensor") return [{ value: 200, label: "Low pressure below 200 kPa" }];
  if (d.kind === "tank-level") return loc.includes("fire") ? [{ value: 40, label: "Low below 40%" }] : [{ value: 40, label: "Low below 40%" }, { value: 98, label: "High above 98%" }];
  if (d.kind === "temperature-probe" && loc.includes("cool room")) return [{ value: 5, label: "Limit 5 °C for 15 min" }];
  if (d.kind === "temperature-probe" && loc.includes("hot water")) return [{ value: 55, label: "Below 55 °C for 30 min" }];
  return [];
}

function ruleWords(d: DeviceLive): string[] {
  switch (d.kind) {
    case "leak-sensor":
      return ["Critical when wet for 1 min"];
    case "flow-meter":
      return d.tag === "FT-01" ? ["Warning when overnight flow is 3 L/min above baseline for 30 min (00:00 to 05:00)", "Critical when 20 L/min above expected for 2 min"] : ["Critical when 20 L/min above expected for 2 min"];
    case "pump-monitor":
      return ["Warning when duty is above 15% for 45 min overnight"];
    case "door-contact":
      return ["Warning when open for 10 min"];
    case "gateway":
      return ["Warning when not heard for 15 min"];
    default:
      return thresholdsFor(d).map((t) => t.label);
  }
}

export function DeviceInspector({ id }: { id: string }) {
  const buildingId = id.split("/")[0];
  const { data: b, isPending } = useBuilding(buildingId);
  const now = useSimNow();
  const d = b?.devices.find((x) => x.id === id);
  const main = d?.readings.find((r) => r.measure !== "current") ?? d?.readings[0];
  const channelId = d && main ? `${d.id}/${main.measure}` : undefined;
  const s = useSeries(channelId, { spanMs: DAY }, 240);
  if (isPending) return <p className={styles.note}>Loading the device</p>;
  if (!b || !d) return <p className={styles.note}>No device {id.split("/")[1]}. It may have been replaced; check the building's device list.</p>;
  const zone = b.summary.zone;
  const binary = main && ["wet", "door", "valve"].includes(main.measure);
  return (
    <>
      <div className={styles.deviceHead}>
        <Tag>{d.tag}</Tag>
        <span>{d.kindLabel}</span>
      </div>
      <h2 className="t-section">{d.location}</h2>
      <p className="soft">{b.summary.name}</p>
      <div className={styles.statusLine}>
        {d.alert ? <StatusLabel status={d.alert} /> : d.status === "offline" ? <StatusLabel status="offline" /> : d.status === "muted" ? <StatusLabel status="muted" /> : <span className="soft">{d.status === "paused" ? "Paused: gateway offline" : "Reporting normally"}</span>}
        {d.openIncidentId && <Link to={`/incidents/${d.openIncidentId}`}>{d.openIncidentId}</Link>}
      </div>
      {main && d.status !== "offline" && (
        <div className={styles.liveValue}>
          {binary ? (
            <span className="t-title">{main.measure === "wet" ? (main.value ? "Wet" : "Dry") : main.measure === "door" ? (main.value ? "Open" : "Closed") : main.value ? "Closed" : "Open"}</span>
          ) : (
            <Value value={main.value} unit={main.unit as Unit} size="figure" decimals={main.measure === "pressure" || main.measure === "level" || main.measure === "duty" ? 0 : 1} />
          )}
          <span className="t-small">at {formatTimeZoned(main.at, zone, { seconds: true })}</span>
        </div>
      )}
      {d.status === "offline" && <p className={styles.note}>{d.tag} has not reported since {d.lastUplink ? formatDateTime(d.lastUplink, zone, { year: false }) : "before this record starts"}. Its readings are paused until it reports again.</p>}
      {s.data && main && (
        <TimeChart
          caption="Last 24 hours"
          panels={[
            {
              id: "v",
              title: d.kindLabel,
              unit: main.unit,
              color: COLOR[main.measure] ?? "var(--ink)",
              kind: binary ? "state" : "line",
              states: main.measure === "wet" ? ["Dry", "Wet"] : main.measure === "door" ? ["Closed", "Open"] : ["Open", "Closed"],
              points: s.data.points,
              gaps: s.data.gaps,
              thresholds: thresholdsFor(d),
              decimals: main.measure === "pressure" || main.measure === "level" ? 0 : 1,
            },
          ]}
          from={now - DAY}
          to={now}
          zone={zone}
          overnight={main.measure === "flow"}
          panelHeight={110}
        />
      )}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Thresholds</h3>
        {ruleWords(d).length ? (
          <ul className={styles.bullets}>
            {ruleWords(d).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : (
          <p className="soft">No alert rules apply to this device.</p>
        )}
        <p className="t-small">Thresholds are set by the customer in Settings.</p>
      </section>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Device health</h3>
        <dl className={styles.facts}>
          <dt>Last uplink</dt>
          <dd>{d.lastUplink ? `${formatTimeZoned(d.lastUplink, zone, { seconds: true })}, ${formatAgo(now - d.lastUplink)}` : "None"}</dd>
          <dt>Battery</dt>
          <dd>{formatNumber(d.battery, 1)}%</dd>
          <dt>Signal</dt>
          <dd>
            RSSI {d.rssi} dBm, SNR {formatNumber(d.snr, 1)} dB{d.rssi < -110 ? ", weak" : ""}
          </dd>
          <dt>Link</dt>
          <dd>
            {d.link}
            {d.gatewayTag ? ` via ${d.gatewayTag}` : ""}
          </dd>
          <dt>Firmware</dt>
          <dd>
            {d.firmware}
            {d.firmwareLatest ? "" : ", update available"}
          </dd>
          <dt>Model</dt>
          <dd>{d.model}</dd>
          <dt>DevEUI</dt>
          <dd className="t-id">{d.devEui}</dd>
        </dl>
      </section>
      <DeviceActions b={b} d={d} />
      <Link className={styles.action} to={`/devices/${encodeURIComponent(d.id)}`}>
        Open the device record
      </Link>
    </>
  );
}

function DeviceActions({ b, d }: { b: BuildingDetail; d: DeviceLive }) {
  const now = useSimNow();
  const cmd = useCommand();
  const [muting, setMuting] = useState(false);
  const [hours, setHours] = useState("2");
  const [reason, setReason] = useState("");
  const [confirmValve, setConfirmValve] = useState(false);
  const valveClosed = d.kind === "valve-controller" && d.readings[0]?.value === 1;
  const error = cmd.error ? (cmd.error as Error).message : null;

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>Actions</h3>
      {d.kind === "valve-controller" && b.valve && (
        <div className={styles.confirmBox}>
          {valveClosed ? (
            <>
              <p>{d.tag} is closed. {b.valve.isolation}</p>
              <Button onClick={() => cmd.mutate({ type: "open-valve", buildingId: b.summary.id, valveTag: d.tag, by: "helen" })}>Open {d.tag}</Button>
            </>
          ) : confirmValve ? (
            <>
              <p>
                <strong>Closing {d.tag} cuts water.</strong> {b.valve.isolation} This is written to the Logbook.
              </p>
              <div className={styles.buttonRow}>
                <Button
                  variant="primary"
                  onClick={() => {
                    const inc = b.incidents.find((i) => i.state !== "resolved" && i.waterLostL !== null);
                    cmd.mutate({ type: "close-valve", buildingId: b.summary.id, valveTag: d.tag, incidentId: inc?.id ?? null, by: "helen" });
                    setConfirmValve(false);
                  }}
                >
                  Close {d.tag}
                </Button>
                <Button variant="quiet" onClick={() => setConfirmValve(false)}>
                  Keep it open
                </Button>
              </div>
            </>
          ) : (
            <Button onClick={() => setConfirmValve(true)}>Close isolation valve {d.tag}</Button>
          )}
        </div>
      )}
      {d.status === "muted" ? (
        <div className={styles.buttonRow}>
          <Button onClick={() => cmd.mutate({ type: "unmute", deviceIds: [d.id], by: "helen" })}>Unmute {d.tag}</Button>
        </div>
      ) : muting ? (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            cmd.mutate({ type: "mute", deviceIds: [d.id], until: now + Number(hours) * 3600_000, reason, by: "helen" }, { onSuccess: () => setMuting(false) });
          }}
        >
          <label>
            <span>Mute for</span>
            <select value={hours} onChange={(e) => setHours(e.target.value)}>
              <option value="1">1 hour</option>
              <option value="2">2 hours</option>
              <option value="4">4 hours</option>
              <option value="8">8 hours</option>
              <option value="24">24 hours</option>
            </select>
          </label>
          <label>
            <span>Reason (required)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: pump replacement, Calloway Plumbing" required />
          </label>
          <p className="t-small">Alerts from {d.tag} pause until {formatTimeZoned(now + Number(hours) * 3600_000, b.summary.zone)}. Readings keep recording.</p>
          <div className={styles.buttonRow}>
            <Button type="submit" variant="primary">
              Mute {d.tag}
            </Button>
            <Button variant="quiet" onClick={() => setMuting(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className={styles.buttonRow}>
          <Button onClick={() => setMuting(true)}>Mute for maintenance</Button>
        </div>
      )}
      {error && <p className={styles.error}>{error}</p>}
    </section>
  );
}
