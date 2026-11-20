/**
 * Replaces modals. Shows whatever ?inspect= names. Esc closes it and focus
 * returns to the canvas. Each screen registers what it can inspect; M1
 * covers incidents, buildings and symbols.
 */
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { usePortfolioStatus } from "@/api/queries";
import { Annunciator } from "@/components/Annunciator";
import { StatusLabel } from "@/components/status/StatusGlyph";
import { SchematicSymbol, symbolByKind, type SymbolKind } from "@/components/symbols/symbols";
import { BUILDING_TYPE_LABEL } from "@/domain/common";
import { formatDateTime, formatDuration, formatNumber, formatTimeZoned } from "@/lib/format";
import { buildingById } from "@/mock/world/buildings";
import { useSimNow } from "@/state/clock";
import { type InspectTarget, useInspect } from "./url";
import styles from "./Inspector.module.css";

export function Inspector() {
  const { target, close } = useInspect();
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // Leave Esc to an open menu or popover first.
      if (document.querySelector("[data-radix-popper-content-wrapper]")) return;
      close();
      document.querySelector<HTMLElement>("main")?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, close]);

  useEffect(() => {
    if (target) ref.current?.focus();
  }, [target?.type, target?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!target) return null;

  return (
    <aside className={styles.inspector} aria-label="Inspector" tabIndex={-1} ref={ref}>
      <div className={styles.head}>
        <span className={styles.kind}>{KIND_LABEL[target.type] ?? "Selection"}</span>
        <button type="button" className={styles.close} onClick={close} aria-label="Close inspector (Esc)">
          <X size={16} strokeWidth={1.5} aria-hidden />
        </button>
      </div>
      <div className={styles.body}>
        <InspectorContent target={target} />
      </div>
    </aside>
  );
}

const KIND_LABEL: Record<string, string> = {
  incident: "Incident",
  building: "Building",
  device: "Device",
  symbol: "Symbol",
  alert: "Alert",
};

function InspectorContent({ target }: { target: InspectTarget }) {
  switch (target.type) {
    case "incident":
      return <IncidentSummary id={target.id} />;
    case "building":
      return <BuildingSummaryView id={target.id} />;
    case "symbol":
      return <SymbolView kind={target.id as SymbolKind} />;
    default:
      return <NotFound what={`${target.type} ${target.id}`} />;
  }
}

function NotFound({ what }: { what: string }) {
  return (
    <p className={styles.note}>
      Nothing found for {what}. It may have been removed, or the link is from another account.
    </p>
  );
}

function IncidentSummary({ id }: { id: string }) {
  const { data } = usePortfolioStatus();
  const now = useSimNow();
  const i = data?.openIncidents.find((x) => x.id === id);
  if (!data) return null;
  if (!i) return <NotFound what={`incident ${id}`} />;
  const b = buildingById.get(i.buildingId)!;
  return (
    <>
      <h2 className="t-section">
        {i.title}, {i.location}
      </h2>
      <p>{b.name}</p>
      <dl className={styles.facts}>
        <dt>Severity</dt>
        <dd>
          <StatusLabel status={i.severity} />
        </dd>
        <dt>Incident</dt>
        <dd>{i.id}</dd>
        <dt>{i.severity === "critical" ? "Critical for" : "Warning for"}</dt>
        <dd>{formatDuration(now - i.severitySince)}</dd>
        <dt>Open for</dt>
        <dd>{formatDuration(now - i.openedAt)}</dd>
        <dt>Opened</dt>
        <dd>{formatDateTime(i.openedAt, b.zone, { year: false })}</dd>
        <dt>Alerts</dt>
        <dd>{formatNumber(i.alertCount)} grouped</dd>
        <dt>State</dt>
        <dd>
          {i.state === "open"
            ? "Not acknowledged"
            : `Acknowledged ${i.acknowledgedAt ? formatTimeZoned(i.acknowledgedAt, b.zone) : ""}${i.acknowledgedBy ? ` by ${i.acknowledgedBy}` : ""}`}
        </dd>
      </dl>
      <p className={styles.note}>The full incident record, with evidence and escalation, opens on the Incidents screen.</p>
      <Link className={styles.action} to={`/incidents/${i.id}`}>
        Open incident {i.id}
      </Link>
    </>
  );
}

function BuildingSummaryView({ id }: { id: string }) {
  const { data } = usePortfolioStatus();
  const now = useSimNow();
  const b = buildingById.get(id);
  const s = data?.buildings.find((x) => x.id === id);
  if (!b) return <NotFound what={`building ${id}`} />;
  return (
    <>
      <h2 className="t-section">{b.name}</h2>
      <p className="soft">
        {b.address}, {b.suburb} {b.state}
      </p>
      {s && <Annunciator state={s.annunciator} label={b.name} variant="compact" />}
      <dl className={styles.facts}>
        <dt>Type</dt>
        <dd>{BUILDING_TYPE_LABEL[b.type]}</dd>
        <dt>Local time</dt>
        <dd>{formatTimeZoned(now, b.zone)}</dd>
        <dt>Devices</dt>
        <dd>{formatNumber(b.deviceCount)}</dd>
      </dl>
      <Link className={styles.action} to={`/buildings/${b.id}`}>
        Open {b.name}
      </Link>
    </>
  );
}

function SymbolView({ kind }: { kind: SymbolKind }) {
  const spec = symbolByKind.get(kind);
  if (!spec) return <NotFound what={`symbol ${kind}`} />;
  return (
    <>
      <h2 className="t-section">{spec.name}</h2>
      <p className="t-prose">{spec.description}</p>
      <div className={styles.symbolBoard}>
        <SchematicSymbol kind={kind} size={96} label={spec.name} level={0.62} />
        <SchematicSymbol kind={kind} size={48} level={0.3} wet closed />
        <SchematicSymbol kind={kind} size={24} />
      </div>
      <dl className={styles.facts}>
        <dt>Group</dt>
        <dd>{spec.group}</dd>
        <dt>Grid</dt>
        <dd>24 px, 1.5 px stroke</dd>
      </dl>
    </>
  );
}
