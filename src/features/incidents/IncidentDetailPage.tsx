/** /incidents/:id: is it being handled, and what is the evidence? */
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useIncident, usePortfolioStatus, useSeries } from "@/api/queries";
import type { IncidentDetail, NotificationView } from "@/api/types";
import { type ChartEvent, type ChartPanel, TimeChart } from "@/components/charts/TimeChart";
import { StatusGlyph, StatusLabel } from "@/components/status/StatusGlyph";
import { Tag } from "@/components/Tag";
import { INCIDENT_CATEGORY_LABEL } from "@/domain/building";
import { formatAUD, formatDateTime, formatDuration, formatNumber, formatTimeZoned, HOUR } from "@/lib/format";
import { useSimNow } from "@/state/clock";
import { incidentHeadline } from "@/lib/headline";
import { ActionBar } from "./ActionBar";
import { NotesAndPhotos } from "./NotesAndPhotos";
import styles from "./IncidentDetailPage.module.css";

export function IncidentDetailPage() {
  const { id } = useParams();
  const { data: i, isPending, isError } = useIncident(id);
  const now = useSimNow();
  if (isPending) return <div className={styles.page} aria-busy><p className="soft">Loading incident {id}</p></div>;
  if (isError || !i) {
    return (
      <div className={styles.page}>
        <h1 className="t-title">Incident {id} not found</h1>
        <p className="t-prose">No incident has this number. Incidents are numbered I-2026-0121 onwards; check the link or open the list of incidents.</p>
        <Link to="/incidents">Open the list of incidents</Link>
      </div>
    );
  }
  const zone = i.zone;
  const resolved = i.state === "resolved";
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>
          <StatusLabel status={i.severity} size={14} />
          <span>{i.id}</span>
          <span>{stateWords(i)}</span>
          <span className="soft">{INCIDENT_CATEGORY_LABEL[i.category]}</span>
        </p>
        <h1 className="t-title">{incidentHeadline(i.title, i.location)}</h1>
        <p className={styles.where}>
          <Link to={`/buildings/${i.buildingId}`}>{i.buildingName}</Link>
          {i.levelLabel && <span>{i.levelLabel}</span>}
          <span className="soft">
            {i.alertCount} {i.alertCount === 1 ? "alert" : "alerts"} grouped. Opened {formatDateTime(i.openedAt, zone)}.
          </span>
        </p>
        <div className={styles.figureRow}>
          <div>
            <p className="t-small">{resolved ? (i.resolution === "false-alarm" ? "Closed as false alarm after" : "Resolved after") : i.severity === "critical" ? "Critical for" : "Open for"}</p>
            <p className="t-figure">{formatDuration((resolved ? i.resolvedAt! : now) - (resolved ? i.openedAt : i.severitySince))}</p>
          </div>
          {!resolved && i.severitySince !== i.openedAt && (
            <p className="soft">
              Open for {formatDuration(now - i.openedAt)}. Critical since {formatTimeZoned(i.severitySince, zone)}.
            </p>
          )}
          {i.acknowledgedAt && (
            <p className="soft">
              Acknowledged by {i.acknowledgedBy} at {formatTimeZoned(i.acknowledgedAt, zone)}, after {formatDuration(i.acknowledgedAt - i.openedAt)}.
            </p>
          )}
        </div>
        <ActionBar i={i} />
      </header>

      <Evidence i={i} />

      <div className={styles.columns}>
        <WaterAndCost i={i} />
        <section className={styles.section} aria-labelledby="alerts-h">
          <h2 id="alerts-h" className="t-section">
            Alerts
          </h2>
          <ol className={styles.alerts}>
            {i.alerts.map((a) => (
              <li key={a.id}>
                <StatusGlyph status={a.severity} size={12} title={a.severity === "critical" ? "Critical" : "Warning"} />
                <span className={styles.alertTime}>{formatTimeZoned(a.raisedAt, zone)}</span>
                <span>
                  <Tag>{a.deviceTag}</Tag> {a.summary}. <span className="soft">{a.location}.</span>
                  {a.clearedAt && <span className="soft"> Cleared {formatTimeZoned(a.clearedAt, zone)}.</span>}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <Escalation i={i} />

      <div className={styles.columns}>
        <NotesAndPhotos i={i} />
        <section className={styles.section} aria-labelledby="log-h">
          <h2 id="log-h" className="t-section">
            Logbook for this incident
          </h2>
          <ol className={styles.log}>
            {[...i.timeline].reverse().map((e) => (
              <li key={e.id}>
                <time className={styles.logTime}>{formatTimeZoned(e.at, zone)}</time>
                <span className={styles.logActor}>{e.actor}</span>
                <span>{e.detail}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

function stateWords(i: IncidentDetail): string {
  switch (i.state) {
    case "open":
      return "Not acknowledged";
    case "acknowledged":
      return "Acknowledged";
    case "dispatched":
      return `Dispatched to ${i.dispatchedTo ?? "a responder"}`;
    case "resolved":
      return i.resolution === "false-alarm" ? "Closed as false alarm" : "Resolved";
  }
}

// ---- evidence -----------------------------------------------------------------------

const MEASURE: Record<string, { color: string; unit: string; state?: [string, string] }> = {
  flow: { color: "var(--jade)", unit: "L/min" },
  pressure: { color: "var(--gauge)", unit: "kPa" },
  level: { color: "var(--jade)", unit: "%" },
  duty: { color: "var(--ink)", unit: "%" },
  temperature: { color: "var(--thermal)", unit: "°C" },
  wet: { color: "var(--jade)", unit: "", state: ["Dry", "Wet"] },
  door: { color: "var(--ink)", unit: "", state: ["Closed", "Open"] },
};

function Evidence({ i }: { i: IncidentDetail }) {
  const portfolio = usePortfolioStatus();
  const b = portfolio.data?.buildings.find((x) => x.id === i.buildingId);
  // channels: the meter that measured the leak first, then each alerting device, state channels last
  const channels = useMemo(() => {
    const out: Array<{ id: string; measure: string; title: string }> = [];
    const add = (deviceId: string, measure: string, title: string) => {
      const id = `${deviceId}/${measure}`;
      if (!out.some((c) => c.id === id)) out.push({ id, measure, title });
    };
    if (i.leak) add(`${i.buildingId}/${i.leak.meterTag}`, "flow", `Flow, ${i.leak.meterTag}`);
    for (const a of i.alerts) {
      const measure = a.ruleName.startsWith("Leak") ? "wet" : a.ruleName.startsWith("Cool room door") ? "door" : a.ruleName.includes("Pump") ? "duty" : a.ruleName.includes("pressure") || a.ruleName.includes("Low pressure") ? "pressure" : a.ruleName.includes("Tank") ? "level" : a.ruleName.includes("Cool room") || a.ruleName.includes("Hot water") ? "temperature" : a.ruleName.includes("flow") || a.ruleName.includes("Flow") ? "flow" : "";
      if (measure) add(a.deviceId, measure, `${a.ruleName.startsWith("Leak") ? "Leak sensor" : a.ruleName}, ${a.deviceTag}`);
    }
    return out.sort((x, y) => Number(!!MEASURE[x.measure]?.state) - Number(!!MEASURE[y.measure]?.state)).slice(0, 4);
  }, [i]);
  const start = Math.min(i.openedAt, i.leak?.from ?? Infinity) - 2 * HOUR;
  const end = i.resolvedAt ? i.resolvedAt + HOUR : undefined;
  const s0 = useSeries(channels[0]?.id, { from: start, to: end }, 500);
  const s1 = useSeries(channels[1]?.id, { from: start, to: end }, 500);
  const s2 = useSeries(channels[2]?.id, { from: start, to: end }, 500);
  const s3 = useSeries(channels[3]?.id, { from: start, to: end }, 500);
  const series = [s0, s1, s2, s3];
  const base = s0.data?.points;
  const panels: ChartPanel[] = [];
  channels.forEach((c, k) => {
    const d = series[k]!.data;
    if (!d) return;
    const m = MEASURE[c.measure]!;
    const thresholds: ChartPanel["thresholds"] = [];
    if (c.measure === "flow" && b && i.leak) {
      thresholds.push({ value: b.nightBaselineLpm, label: `Usual overnight ${formatNumber(b.nightBaselineLpm, 1)} L/min` });
    }
    if (c.measure === "pressure") thresholds.push({ value: 200, label: "Minimum 200 kPa" });
    if (c.measure === "temperature" && c.title.startsWith("Cool")) thresholds.push({ value: 5, label: "Limit 5 °C" });
    if (c.measure === "temperature" && c.title.startsWith("Hot")) thresholds.push({ value: 55, label: "Minimum 55 °C" });
    if (c.measure === "duty") thresholds.push({ value: 15, label: "Overnight limit 15%" });
    if (c.measure === "level") thresholds.push({ value: 40, label: "Low 40%" });
    panels.push({
      id: c.id,
      title: c.title,
      unit: m.unit,
      color: m.color,
      kind: m.state ? "state" : "line",
      states: m.state,
      points: k === 0 || !base ? d.points : alignTo(d.points, base),
      gaps: d.gaps,
      thresholds,
      decimals: c.measure === "pressure" || c.measure === "level" || c.measure === "duty" ? 0 : 1,
      yMin: c.measure === "flow" || c.measure === "duty" ? 0 : undefined,
    });
  });
  const events: ChartEvent[] = [];
  events.push({ t: i.openedAt, label: "Raised", status: i.severitySince > i.openedAt ? "warning" : i.peakSeverity });
  if (i.severitySince > i.openedAt) events.push({ t: i.severitySince, label: "Critical", status: "critical" });
  if (i.acknowledgedAt) events.push({ t: i.acknowledgedAt, label: "Acknowledged" });
  if (i.dispatchedAt) events.push({ t: i.dispatchedAt, label: "Dispatched" });
  if (i.isolatedAt) events.push({ t: i.isolatedAt, label: "Isolated" });
  if (i.resolvedAt) events.push({ t: i.resolvedAt, label: i.resolution === "false-alarm" ? "Closed" : "Resolved" });
  const to = base?.length ? Math.max(base[base.length - 1]![0], end ?? 0) : (end ?? Date.now());
  return (
    <section className={styles.section} aria-labelledby="evidence-h">
      <h2 id="evidence-h" className="t-section">
        Evidence
      </h2>
      {panels.length ? (
        <TimeChart caption={`${i.buildingName}, readings around ${i.id}`} panels={panels} from={start} to={to} zone={i.zone} events={events} overnight panelHeight={110} stale={s0.isFetching && !s0.isPending} />
      ) : (
        <p className="soft">{channels.length ? "Loading readings" : "This incident has no readings to chart: it was raised from a gateway or device status."}</p>
      )}
      {i.leak && <p className="t-small">The overnight figure is the median of the half-hour averages between 01:00 and 04:00. Gaps are periods when the device did not report.</p>}
    </section>
  );
}

function alignTo(points: Array<[number, number | null]>, base: Array<[number, number | null]>): Array<[number, number | null]> {
  let j = 0;
  return base.map(([t]) => {
    while (j < points.length - 1 && Math.abs(points[j + 1]![0] - t) <= Math.abs(points[j]![0] - t)) j++;
    return [t, points[j]?.[1] ?? null];
  });
}

// ---- water and cost -------------------------------------------------------------------

function WaterAndCost({ i }: { i: IncidentDetail }) {
  const tariff = formatAUD(i.tariffPerKL, { cents: true });
  return (
    <section className={styles.section} aria-labelledby="water-h">
      <h2 id="water-h" className="t-section">
        Water lost and cost
      </h2>
      {i.waterLostL === null ? (
        <p className="soft">Not metered. This incident was seen by a sensor that reports wet or dry, or by a non-water measure, so no volume was recorded.</p>
      ) : (
        <dl className={styles.costs}>
          <dt>{i.state === "resolved" || i.leak?.to ? "Water lost" : "Water lost so far"}</dt>
          <dd>
            <strong>{formatNumber(i.waterLostL / 1000, 2)} kL</strong>
            <span className="soft">
              {" "}
              {formatNumber(i.waterLostL, 1)} L, {formatAUD(i.costAUD!, { cents: true })} at {tariff}/kL
            </span>
          </dd>
          {i.leak && (
            <>
              <dt>Excess flow</dt>
              <dd>
                {formatNumber(i.leak.rateLpm, 1)} L/min above the usual, from {formatTimeZoned(i.leak.from, i.zone)}
                {i.leak.to ? ` to ${formatTimeZoned(i.leak.to, i.zone)} (${formatDuration(i.leak.to - i.leak.from)})` : ", still running"}
              </dd>
            </>
          )}
          {i.dailyLossL !== null && (
            <>
              <dt>If left unattended</dt>
              <dd>
                {formatNumber(i.dailyLossL / 1000, 2)} kL a day, {formatAUD(i.dailyCostAUD!, { cents: true })} a day
              </dd>
            </>
          )}
        </dl>
      )}
      <p className="t-small">The tariff of {tariff}/kL is illustrative and set in Settings. Water damage is not priced here; it is recorded below for the owner or insurer.</p>
      {i.damage && (
        <p>
          <strong>Damage recorded.</strong> {i.damage}
        </p>
      )}
    </section>
  );
}

// ---- escalation ---------------------------------------------------------------------

function resultWords(n: NotificationView): string {
  return n.detail;
}

function Escalation({ i }: { i: IncidentDetail }) {
  const steps = new Map<string, NotificationView[]>();
  for (const n of i.notifications) {
    const key = n.stepSeq === null ? `notice-${n.at}` : `step-${n.stepSeq}`;
    steps.set(key, [...(steps.get(key) ?? []), n]);
  }
  const e = i.escalation;
  return (
    <section className={styles.section} aria-labelledby="esc-h">
      <h2 id="esc-h" className="t-section">
        Escalation and delivery
      </h2>
      {e.steps > 0 ? (
        <p>
          {e.steps} {e.steps === 1 ? "step" : "steps"}, {e.messages} messages: {e.delivered} delivered, {e.failed} failed
          {e.held ? `, ${e.held} SMS held in quiet hours` : ""}. {e.acknowledged ? `Acknowledged by ${i.acknowledgedBy}.` : "None acknowledged."}
        </p>
      ) : (
        <p className="soft">{i.peakSeverity === "warning" ? "Warnings send one notice and do not escalate." : "No escalation steps ran."}</p>
      )}
      <table className={styles.escTable}>
        <caption className="visually-hidden">Every notification sent for {i.id}, with its delivery result</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Step</th>
            <th scope="col">Person</th>
            <th scope="col">Channel</th>
            <th scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
          {[...steps.values()].flatMap((ns) =>
            ns.map((n, k) => (
              <tr key={n.id} className={k === 0 ? styles.stepStart : undefined}>
                <td>{k === 0 ? formatTimeZoned(n.at, i.zone) : ""}</td>
                <td>{k === 0 ? (n.stepSeq === null ? "Notice" : `${n.stepSeq}${n.cycle ? `, round ${n.cycle}` : ""}`) : ""}</td>
                <td>{k === 0 ? n.person : ""}</td>
                <td>{n.channel === "sms" ? "SMS" : n.channel === "push" ? "Push" : "Email"}</td>
                <td className={n.result === "failed" ? styles.failed : n.result === "held" ? "soft" : undefined}>
                  {n.result === "failed" && <StatusGlyph status="offline" size={10} />} {resultWords(n)}
                </td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </section>
  );
}
