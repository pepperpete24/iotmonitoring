/** /reports/incident/:id: one incident, start to finish, as a document for an owner or insurer. */
import { Link, useParams } from "react-router-dom";
import { useIncident } from "@/api/queries";
import { brand } from "@/brand";
import { INCIDENT_CATEGORY_LABEL } from "@/domain/building";
import { incidentHeadline } from "@/lib/headline";
import { formatDate, formatDateTime, formatDuration, formatTimeZoned } from "@/lib/format";
import { useSimNow } from "@/state/clock";
import { Escalation, Evidence, WaterAndCost } from "@/features/incidents/IncidentDetailPage";
import { ReportFrame, Sheet } from "./ReportFrame";
import styles from "./Report.module.css";

export function IncidentReportPage() {
  const { id } = useParams();
  const { data: i, isPending, isError } = useIncident(id);
  const now = useSimNow();
  if (isPending) return <ReportFrame title="Incident report"><p className="soft">Preparing the report</p></ReportFrame>;
  if (isError || !i) {
    return (
      <ReportFrame title="Incident report">
        <p>No incident {id}. Open the list of incidents and export from the incident itself.</p>
        <Link to="/incidents">Open the list of incidents</Link>
      </ReportFrame>
    );
  }
  const z = i.zone;
  const footer = `${i.id}, ${i.buildingName}. Prepared ${formatDateTime(now, "Australia/Sydney")} from the ${brand.name} incident record. Times in ${formatTimeZoned(i.openedAt, z).split(" ")[1]} unless shown.`;
  const resolved = i.state === "resolved";
  const people = [...new Set(i.timeline.map((e) => e.actor).filter((a) => a !== brand.name))];
  return (
    <ReportFrame
      title={`Incident report, ${i.id}`}
      toolbar={
        <Link to={`/incidents/${i.id}`} className="no-print">
          Back to the incident
        </Link>
      }
    >
      <Sheet footer={footer}>
        <header className={styles.titleBlock}>
          <p className={styles.docType}>Incident report, {i.id}</p>
          <div className={styles.docMeta}>
            {i.buildingName}
            <br />
            {INCIDENT_CATEGORY_LABEL[i.category]}
            <br />
            Prepared {formatDate(now, "Australia/Sydney")}
          </div>
          <h2 className={styles.docTitle}>{incidentHeadline(i.title, i.location)}</h2>
        </header>

        <p className={styles.lead}>
          <strong>{i.peakSeverity === "critical" ? "Critical" : "Warning"}.</strong> Raised {formatDateTime(i.openedAt, z)} from {i.alertCount} {i.alertCount === 1 ? "alert" : "alerts"}.{" "}
          {i.acknowledgedAt ? `Acknowledged by ${i.acknowledgedBy} after ${formatDuration(i.acknowledgedAt - i.openedAt)}. ` : "Not acknowledged. "}
          {resolved
            ? `${i.resolution === "false-alarm" ? "Closed as a false alarm" : "Resolved"} by ${i.resolvedBy} after ${formatDuration(i.resolvedAt! - i.openedAt)}.`
            : `Still open after ${formatDuration(now - i.openedAt)}.`}
        </p>

        <section className={styles.section}>
          <h3 className={styles.h2}>Record</h3>
          <dl className={styles.facts}>
            <dt>Building</dt>
            <dd>
              {i.buildingName}
              {i.levelLabel ? `, ${i.levelLabel}` : ""}
            </dd>
            <dt>Where</dt>
            <dd>{i.location}</dd>
            <dt>Raised</dt>
            <dd>{formatDateTime(i.openedAt, z)}</dd>
            {i.severitySince > i.openedAt && (
              <>
                <dt>Became critical</dt>
                <dd>{formatDateTime(i.severitySince, z)}</dd>
              </>
            )}
            <dt>Acknowledged</dt>
            <dd>{i.acknowledgedAt ? `${formatTimeZoned(i.acknowledgedAt, z)} by ${i.acknowledgedBy}` : "Not acknowledged"}</dd>
            {i.dispatchedAt && (
              <>
                <dt>Dispatched</dt>
                <dd>
                  {formatTimeZoned(i.dispatchedAt, z)}, {i.dispatchedTo}
                  {i.etaMin ? `, ETA ${i.etaMin} min` : ""}
                </dd>
              </>
            )}
            {i.isolatedAt && (
              <>
                <dt>Isolated</dt>
                <dd>{formatTimeZoned(i.isolatedAt, z)}</dd>
              </>
            )}
            <dt>{resolved ? "Resolved" : "State"}</dt>
            <dd>{resolved ? `${formatDateTime(i.resolvedAt!, z)} by ${i.resolvedBy}` : "Open"}</dd>
            <dt>Cause</dt>
            <dd>{i.cause ?? "Not yet recorded"}</dd>
            <dt>Action taken</dt>
            <dd>{i.action ?? "Not yet recorded"}</dd>
            <dt>People involved</dt>
            <dd>{people.join(", ") || "None"}</dd>
          </dl>
        </section>

        <WaterAndCost i={i} />
        <Evidence i={i} />
      </Sheet>

      <Sheet footer={footer}>
        <Escalation i={i} />
        <section className={styles.section}>
          <h3 className={styles.h2}>Who did what</h3>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Who</th>
                <th scope="col">What</th>
              </tr>
            </thead>
            <tbody>
              {i.timeline
                .filter((e) => e.action !== "notification")
                .map((e) => (
                  <tr key={e.id}>
                    <td>{formatDateTime(e.at, z, { year: false })}</td>
                    <td className={styles.nowrap}>{e.actor}</td>
                    <td>{e.detail}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <p className={styles.note}>Notification entries are listed under escalation above. The full Logbook keeps every entry.</p>
        </section>
        {(i.notes.length > 0 || i.photos.length > 0) && (
          <section className={styles.section}>
            <h3 className={styles.h2}>Notes and photos</h3>
            <ul className={styles.facts}>
              {[...i.notes.map((n) => ({ at: n.at, by: n.by, text: n.text })), ...i.photos.map((p) => ({ at: p.at, by: p.by, text: `Photo: ${p.caption}` }))]
                .sort((a, b) => a.at - b.at)
                .map((n, k) => (
                  <li key={k} style={{ gridColumn: "1 / -1", padding: "1.6mm 0", borderBottom: "1px solid var(--rule)" }}>
                    {n.text} <span className={styles.note}>{n.by}, {formatTimeZoned(n.at, z)}</span>
                  </li>
                ))}
            </ul>
          </section>
        )}
        <p className={styles.note}>
          This is a record of what the monitoring platform observed and what people did in response. It supports an owner's or insurer's review; it does not
          certify the cause or the condition of the building.
        </p>
      </Sheet>
    </ReportFrame>
  );
}
