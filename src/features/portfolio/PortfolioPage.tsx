/** /portfolio: which building needs me? */
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useBuilding, usePortfolioStatus } from "@/api/queries";
import type { BuildingSummary } from "@/api/types";
import { Annunciator } from "@/components/Annunciator";
import { Segmented } from "@/components/Button";
import { StatusGlyph } from "@/components/status/StatusGlyph";
import { type Column, DataTable, type SortState } from "@/components/table/DataTable";
import { BUILDING_TYPE_LABEL, STATE_ORDER, STATUS_LABEL, STATUS_RANK } from "@/domain/common";
import { formatDuration, formatNumber, formatTimeZoned } from "@/lib/format";
import { parseScope, useInspect } from "@/shell/url";
import { useSimNow } from "@/state/clock";
import { usePhone } from "@/lib/useMedia";
import { AustraliaMap } from "./AustraliaMap";
import { briefingSegments, waterSentence } from "./briefing";
import { MiniRiser } from "./MiniRiser";
import { DayOne } from "./DayOne";
import { incidentHeadline } from "@/lib/headline";
import styles from "./PortfolioPage.module.css";

type View = "attention" | "all" | "state" | "type";

const VIEWS: ReadonlyArray<{ value: View; label: string }> = [
  { value: "attention", label: "Needs attention" },
  { value: "all", label: "All" },
  { value: "state", label: "By state" },
  { value: "type", label: "By type" },
];

const attentionRank = (b: BuildingSummary) => STATUS_RANK[b.status];

export function PortfolioPage() {
  const { data, isPending, isError, refetch } = usePortfolioStatus();
  const [params, setParams] = useSearchParams();
  const { open, target } = useInspect();
  const view = (params.get("view") as View) || "attention";
  const mode = params.get("show") === "map" ? "map" : "list";
  const scope = parseScope(params.get("scope"));
  const [expanded, setExpanded] = useState<string | null>(null);
  const phone = usePhone();
  const [sort, setSort] = useState<SortState>({ key: "building", dir: "asc" });
  const setParam = (k: string, v: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v === null) n.delete(k);
        else n.set(k, v);
        return n;
      },
      { replace: true },
    );

  if (isPending) {
    return (
      <div className={styles.page} aria-busy>
        <h1 className="t-title">Portfolio</h1>
        <p className={styles.soft}>Reading the latest from 16 buildings</p>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className={styles.page}>
        <h1 className="t-title">Portfolio</h1>
        <p className="t-prose">The portfolio could not be loaded. Devices are still reporting and alerts are still being sent.</p>
        <button type="button" className={styles.retry} onClick={() => void refetch()}>
          Try again
        </button>
      </div>
    );
  }

  if (data.buildings.length === 0) {
    return (
      <div className={styles.page}>
        <DayOne organisation={data.organisation.name} />
      </div>
    );
  }
  const zone = data.organisation.viewerZone;
  let rows = data.buildings;
  if (scope.kind === "state") rows = rows.filter((b) => b.state === scope.id);
  if (scope.kind === "building") rows = rows.filter((b) => b.id === scope.id);
  const attention = rows.filter((b) => b.status !== "normal");
  if (view === "attention") rows = attention;

  const byAttention = (a: BuildingSummary, z: BuildingSummary) => attentionRank(a) - attentionRank(z) || a.name.localeCompare(z.name);
  const all = ledgerColumns(zone);
  // At phone width the ledger keeps what answers "which building needs me".
  const columns = phone ? all.filter((c) => ["building", "status", "open"].includes(c.key)) : all;
  const groups: Array<{ title: string | null; rows: BuildingSummary[] }> =
    view === "state"
      ? STATE_ORDER.filter((s) => rows.some((b) => b.state === s)).map((s) => ({ title: s, rows: rows.filter((b) => b.state === s) }))
      : view === "type"
        ? [...new Set(rows.map((b) => b.type))].sort().map((t) => ({ title: BUILDING_TYPE_LABEL[t], rows: rows.filter((b) => b.type === t) }))
        : [{ title: null, rows }];

  const sorted = (list: BuildingSummary[]) => (sort.key === "building" ? [...list].sort((a, z) => (sort.dir === "asc" ? byAttention(a, z) : byAttention(z, a))) : list);

  return (
    <div className={styles.page}>
      <h1 className="visually-hidden">Portfolio</h1>
      <p className={`t-briefing ${styles.briefing}`} aria-live="polite">
        {briefingSegments(data).map((s, i) => (s.strong ? <strong key={i}>{s.text}</strong> : <span key={i}>{s.text}</span>))}
      </p>
      <p className={styles.water}>{waterSentence(data)}</p>

      <div className={styles.controls}>
        <Segmented<View> label="Saved views" value={view} onChange={(v) => setParam("view", v === "attention" ? null : v)} options={VIEWS} />
        <Segmented<"list" | "map"> label="Show as" value={mode} onChange={(v) => setParam("show", v === "list" ? null : v)} options={[{ value: "list", label: "List" }, { value: "map", label: "Map" }]} />
        {scope.kind !== "organisation" && (
          <span className={styles.scope}>
            Showing {scope.kind === "state" ? scope.id : data.buildings.find((b) => b.id === scope.id)?.name}.{" "}
            <button type="button" className={styles.linkButton} onClick={() => setParam("scope", null)}>
              Show all buildings
            </button>
          </span>
        )}
      </div>

      {mode === "map" ? (
        <AustraliaMap buildings={rows.length ? rows : data.buildings} onSelect={(id) => open("building", id)} selectedId={target?.type === "building" ? target.id : null} />
      ) : rows.length === 0 ? (
        <p className={styles.empty}>
          {view === "attention" ? "Every building is reporting normally. Buildings appear here when an alert is raised or a device stops reporting." : "No buildings match this view."}
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.title ?? "all"} className={styles.group}>
            {g.title && <h2 className="t-section">{g.title}</h2>}
            <DataTable
              caption={g.title ? `Buildings, ${g.title}` : "Buildings, sorted by attention then name"}
              columns={columns}
              rows={sorted(g.rows)}
              rowKey={(b) => b.id}
              sort={sort}
              onSort={setSort}
              selectedKey={expanded}
              onSelect={(b) => setExpanded((e) => (e === b.id ? null : b.id))}
              renderExpanded={(b) => (expanded === b.id ? <Expanded b={b} /> : null)}
            />
          </section>
        ))
      )}
      {view === "attention" && mode === "list" && (
        <p className={styles.soft}>
          {data.buildings.length - attention.length} other buildings are reporting normally.{" "}
          <button type="button" className={styles.linkButton} onClick={() => setParam("view", "all")}>
            Show all 16
          </button>
        </p>
      )}
    </div>
  );
}

function ledgerColumns(zone: string): Column<BuildingSummary>[] {
  return [
    {
      key: "building",
      header: "Building",
      sortValue: (b) => `${STATUS_RANK[b.status]}${b.name}`,
      render: (b) => (
        <span className={styles.building}>
          <Link to={`/buildings/${b.id}`} onClick={(e) => e.stopPropagation()} className={styles.name}>
            {b.name}
          </Link>
          <span className="t-small">
            {BUILDING_TYPE_LABEL[b.type]}, {b.suburb} {b.state}
          </span>
        </span>
      ),
    },
    {
      key: "status",
      header: <span className="visually-hidden">Status</span>,
      width: 28,
      render: (b) => (b.status !== "normal" ? <StatusGlyph status={b.status} title={STATUS_LABEL[b.status]} size={14} /> : null),
    },
    { key: "ann", header: "Annunciator", width: 140, render: (b) => <Annunciator state={b.annunciator} variant="compact" label={b.name} /> },
    { key: "open", header: "Open", align: "num", width: 56, sortValue: (b) => b.openIncidents, render: (b) => (b.openIncidents ? formatNumber(b.openIncidents) : <span className={styles.soft}>None</span>) },
    {
      key: "online",
      header: "Devices online",
      align: "num",
      sortValue: (b) => b.devicesOnline / b.devicesTotal,
      render: (b) => (
        <span>
          {b.devicesOnline} of {b.devicesTotal}
          {b.devicesMuted ? <span className={styles.soft}>, {b.devicesMuted} muted</span> : null}
        </span>
      ),
    },
    { key: "water", header: "Water, 24 h", width: 170, sortValue: (b) => b.water24hL / (b.water24hUsualL || 1), render: (b) => <WaterBullet b={b} /> },
    {
      key: "night",
      header: "Overnight flow",
      align: "num",
      sortValue: (b) => (b.nightFlowLpm ?? 0) - b.nightBaselineLpm,
      render: (b) => <NightCell b={b} />,
    },
    { key: "last", header: "Last reading", align: "num", sortValue: (b) => b.lastReadingAt ?? 0, render: (b) => (b.lastReadingAt ? formatTimeZoned(b.lastReadingAt, zone) : "None") },
  ];
}

/** Actual against expected: a thin jade bar, an ink tick for the usual, and the percentage in words. */
function WaterBullet({ b }: { b: BuildingSummary }) {
  const max = Math.max(b.water24hL, b.water24hUsualL) * 1.15 || 1;
  const pct = b.water24hUsualL ? Math.round((b.water24hL / b.water24hUsualL) * 100) : null;
  const kl = b.water24hL / 1000;
  return (
    <span className={styles.bullet} title={`${formatNumber(kl, 1)} kL in the last 24 h; usual ${formatNumber(b.water24hUsualL / 1000, 1)} kL`}>
      <svg width={64} height={10} aria-hidden>
        <rect x={0} y={3} width={(b.water24hL / max) * 64} height={4} rx={2} className={styles.bulletBar} />
        <line x1={(b.water24hUsualL / max) * 64} x2={(b.water24hUsualL / max) * 64} y1={0} y2={10} className={styles.bulletTick} />
      </svg>
      <span>
        {formatNumber(kl, kl < 10 ? 1 : 0)} kL
        {pct !== null && <span className={styles.soft}> {pct}%</span>}
      </span>
    </span>
  );
}

function NightCell({ b }: { b: BuildingSummary }) {
  if (b.nightFlowLpm === null) return <span className={styles.soft}>No data</span>;
  const diff = b.nightFlowLpm - b.nightBaselineLpm;
  return (
    <span className={styles.night}>
      <span>
        {formatNumber(b.nightFlowLpm, 1)} <span className={styles.unit}>L/min</span>
      </span>
      {diff >= 3 && <span className={styles.diff}>{formatNumber(diff, 1)} above usual</span>}
    </span>
  );
}

function Expanded({ b }: { b: BuildingSummary }) {
  const { data } = useBuilding(b.id);
  const now = useSimNow();
  const top = data?.incidents.find((i) => i.id === b.topIncidentId);
  const levelId = top ? (data?.levels.find((l) => l.label === top.levelLabel)?.id ?? null) : null;
  const offline = data?.devices.filter((d) => d.status === "offline") ?? [];
  return (
    <div className={styles.expanded}>
      {data && <MiniRiser levels={data.levels} markLevelId={levelId} status={top?.severity ?? null} label={top ? `${top.levelLabel ?? "Level"} marked in a section through ${b.name}` : `Section through ${b.name}`} />}
      <div className={styles.expandedText}>
        {top ? (
          <>
            <p>
              <strong>{incidentHeadline(top.title, top.location)}.</strong>{" "}
              {top.severity === "critical" ? "Critical" : "Warning"} for {formatDuration(now - top.severitySince)},{" "}
              {top.state === "open" ? "not acknowledged" : `acknowledged by ${top.acknowledgedBy}`}.
              {top.waterLostL !== null && ` ${formatNumber(top.waterLostL / 1000, 2)} kL lost so far.`}
            </p>
            <p className={styles.links}>
              <Link to={`/incidents/${top.id}`}>Open incident {top.id}</Link>
              <Link to={`/buildings/${b.id}`}>Open {b.name}</Link>
            </p>
          </>
        ) : (
          <>
            <p>{offline.length ? `${offline.map((d) => `${d.tag} (${d.location})`).join(", ")} not reporting.` : b.devicesMuted ? `${b.devicesMuted} devices muted for maintenance.` : "No open incidents. All devices reporting."}</p>
            <p className={styles.links}>
              <Link to={`/buildings/${b.id}`}>Open {b.name}</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
