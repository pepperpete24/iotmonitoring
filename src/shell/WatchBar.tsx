/**
 * Always visible. One line per open critical incident with a live elapsed
 * timer; warnings collapse into a count that expands. Selecting a line opens
 * the incident in the inspector.
 */
import { useState } from "react";
import { usePortfolioStatus } from "@/api/queries";
import type { OpenIncidentSummary } from "@/api/types";
import { StatusGlyph } from "@/components/status/StatusGlyph";
import { useSimNow } from "@/state/clock";
import { buildingById } from "@/mock/world/buildings";
import { countWord, formatDuration, formatTimeZoned, plural } from "@/lib/format";
import { useInspect } from "./url";
import styles from "./WatchBar.module.css";

function ackText(i: OpenIncidentSummary): string {
  if (i.state === "open") return "Not acknowledged";
  if (i.state === "acknowledged" && i.acknowledgedBy) return `Acknowledged by ${i.acknowledgedBy.split(" ")[0]}`;
  if (i.state === "dispatched") return "Dispatched";
  return "Acknowledged";
}

export function WatchBar() {
  const { data, isPending, isError } = usePortfolioStatus();
  const now = useSimNow();
  const { open, target } = useInspect();
  const [showWarnings, setShowWarnings] = useState(false);

  if (isPending) {
    return (
      <section className={styles.bar} aria-label="Watch" aria-busy>
        <p className={styles.quiet}>Checking open incidents</p>
      </section>
    );
  }
  if (isError || !data) {
    return (
      <section className={styles.bar} aria-label="Watch">
        <p className={styles.quiet}>Open incidents could not be loaded. Readings are still being recorded; reload to try again.</p>
      </section>
    );
  }

  const criticals = data.openIncidents.filter((i) => i.severity === "critical");
  const warnings = data.openIncidents.filter((i) => i.severity === "warning");
  const unackedWarnings = warnings.filter((i) => i.state === "open").length;

  const row = (i: OpenIncidentSummary) => {
    const b = buildingById.get(i.buildingId);
    const selected = target?.type === "incident" && target.id === i.id;
    const elapsed = formatDuration(now - i.severitySince);
    return (
      <li key={i.id}>
        <button
          type="button"
          className={`${styles.line} ${styles[i.severity]}`}
          aria-current={selected || undefined}
          onClick={() => open("incident", i.id)}
        >
          <StatusGlyph status={i.severity} size={12} />
          <span className={styles.building}>{b?.name}</span>
          <span>
            {i.title}, {i.location}
          </span>
          <span className={styles.elapsed}>
            {i.severity === "critical" ? "Critical" : "Warning"} for {elapsed}
          </span>
          <span className={i.state === "open" ? styles.unacked : styles.soft}>{ackText(i)}</span>
          {b && i.severity === "warning" && <span className={styles.soft}>since {formatTimeZoned(i.severitySince, b.zone)}</span>}
        </button>
      </li>
    );
  };

  return (
    <section className={`${styles.bar} ${criticals.length ? styles.hasCritical : ""}`} aria-label="Watch">
      {criticals.length === 0 && <p className={styles.quiet}>No critical incidents.</p>}
      <ul className={styles.list}>{criticals.map(row)}</ul>
      {warnings.length > 0 && (
        <>
          <button
            type="button"
            className={styles.warningsToggle}
            aria-expanded={showWarnings}
            onClick={() => setShowWarnings((v) => !v)}
          >
            <StatusGlyph status="warning" size={12} />
            <span>
              {plural(warnings.length, "warning")}
              {unackedWarnings > 0 && `, ${countWord(unackedWarnings, false)} not acknowledged`}
            </span>
            <span className={styles.soft}>{showWarnings ? "Hide" : "Show"}</span>
          </button>
          {showWarnings && <ul className={styles.list}>{warnings.map(row)}</ul>}
        </>
      )}
    </section>
  );
}
