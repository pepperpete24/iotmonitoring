/** /dev/tokens: colour, type and component specimen. Internal only. */
import { useEffect, useState } from "react";
import { usePortfolioStatus } from "@/api/queries";
import type { BuildingSummary } from "@/api/types";
import { Annunciator } from "@/components/Annunciator";
import { Button, Segmented } from "@/components/Button";
import { StatusGlyph, StatusLabel } from "@/components/status/StatusGlyph";
import { Tag } from "@/components/Tag";
import { Value } from "@/components/Value";
import { type Column, DataTable, type SortState } from "@/components/table/DataTable";
import { BUILDING_TYPE_LABEL, STATUS_RANK } from "@/domain/common";
import { formatAUD, formatNumber, formatTimeZoned } from "@/lib/format";
import { useSimNow } from "@/state/clock";
import { useUi } from "@/state/ui";
import { useInspect } from "@/shell/url";
import styles from "./dev.module.css";

const COLOURS = [
  ["ground", "App background"],
  ["paper", "Sheets, tables, drawing"],
  ["ink", "Text, symbols"],
  ["ink-soft", "Labels, units"],
  ["rule", "Hairlines"],
  ["jade", "Water, brand, primary action"],
  ["gauge", "Pressure"],
  ["thermal", "Temperature"],
  ["critical", "Critical only"],
  ["warning", "Warning only"],
] as const;

const TYPE: Array<[string, string, string]> = [
  ["t-figure", "44 Figure", "3 h 36 min"],
  ["t-title", "28 Title", "Kendall Street Tower"],
  ["t-briefing", "20 Briefing", "One critical incident, not yet acknowledged."],
  ["t-section", "16 Section", "Escalation"],
  ["t-body", "14 Body", "Gateway GW-07 has not reported for 14 minutes. Readings from 9 devices are paused."],
  ["t-table", "13 Table", "15.6 L/min  388 kPa  2,281.6 L"],
  ["t-small", "12 Small", "Fri 20 Nov 2026, 07:48 AEDT"],
  ["t-id", "12 Identifier", "70B3D57ED0051A2F"],
];

function useCssVar(name: string) {
  const theme = useUi((s) => s.theme);
  const [v, setV] = useState("");
  useEffect(() => {
    // Read after the theme attribute has been applied to <html>.
    const id = requestAnimationFrame(() =>
      setV(getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim()),
    );
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setV(getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim());
    mq.addEventListener("change", onChange);
    return () => {
      cancelAnimationFrame(id);
      mq.removeEventListener("change", onChange);
    };
  }, [name, theme]);
  return v;
}

function Swatch({ name, job }: { name: string; job: string }) {
  const hex = useCssVar(name);
  return (
    <li className={styles.swatch}>
      <span className={styles.chip} style={{ background: `var(--${name})` }} />
      <span>{name}</span>
      <span className="t-small">{hex}</span>
      <span className="t-small">{job}</span>
    </li>
  );
}

export function TokensPage() {
  const { data } = usePortfolioStatus();
  const now = useSimNow();
  const { open, target } = useInspect();
  const [sort, setSort] = useState<SortState>({ key: "attention", dir: "asc" });
  const [demo, setDemo] = useState<"a" | "b">("a");
  const [reading, setReading] = useState(15.6);

  const columns: Column<BuildingSummary>[] = [
    {
      key: "attention",
      header: "Building",
      sortValue: (b) => `${STATUS_RANK[b.status]}${b.name}`,
      render: (b) => (
        <span className={styles.buildingCell}>
          <span>{b.name}</span>
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
      render: (b) => (b.status !== "normal" ? <StatusGlyph status={b.status} title={b.status} /> : null),
    },
    { key: "ann", header: "Annunciator", width: 140, render: (b) => <Annunciator state={b.annunciator} variant="compact" label={b.name} /> },
    { key: "devices", header: "Devices", align: "num", sortValue: (b) => b.deviceCount, render: (b) => formatNumber(b.deviceCount) },
    { key: "local", header: "Local time", align: "num", render: (b) => formatTimeZoned(now, b.zone) },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className="t-title">Tokens</h1>
        <p className="t-body t-prose soft">
          Colour, type and the M1 primitives, in the current theme. Switch theme and density in the demo tray (Shift D).
        </p>
      </header>

      <section className={styles.section}>
        <h2 className="t-section">Colour</h2>
        <ul className={styles.swatches}>
          {COLOURS.map(([n, j]) => (
            <Swatch key={n} name={n} job={j} />
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className="t-section">Type</h2>
        <dl className={styles.typeList}>
          {TYPE.map(([cls, label, sample]) => (
            <div key={cls} className={styles.typeRow}>
              <dt className="t-small">{label}</dt>
              <dd className={cls}>{sample}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={styles.section}>
        <h2 className="t-section">Status, tags and readings</h2>
        <div className={styles.inline}>
          <StatusLabel status="critical" />
          <StatusLabel status="warning" />
          <StatusLabel status="offline" />
          <StatusLabel status="muted" />
          <span>Acknowledged</span>
        </div>
        <div className={styles.inline}>
          <Tag>FT-01</Tag>
          <Tag>WL-B2-03</Tag>
          <Tag>XV-01</Tag>
          <Tag>GW-03</Tag>
        </div>
        <div className={styles.inline}>
          <Value value={reading} unit="L/min" />
          <Value value={142} unit="kPa" />
          <Value value={7.8} unit="°C" />
          <Value value={-117} unit="dBm" />
          <Value value={null} unit="kPa" missing="Offline since 05:38" />
          <span>{formatAUD(7.99)}</span>
          <Button variant="quiet" onClick={() => setReading((r) => Math.round((r + 0.3) * 10) / 10)}>
            Change reading
          </Button>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className="t-section">Annunciator</h2>
        <Annunciator state={{ leak: "critical", flow: "warning", pump: "warning" }} label="Kendall Street Tower" />
        <Annunciator state={{ link: "offline" }} label="Riverbend Plaza" />
        <Annunciator state={{}} label="Lorne Road Medical Centre" />
      </section>

      <section className={styles.section}>
        <h2 className="t-section">Controls</h2>
        <div className={styles.inline}>
          <Button variant="primary">Acknowledge</Button>
          <Button>Dispatch</Button>
          <Button variant="quiet">Mark false alarm</Button>
          <Segmented
            label="Sample"
            value={demo}
            onChange={setDemo}
            options={[
              { value: "a", label: "Flow and tanks" },
              { value: "b", label: "Pressure" },
            ]}
          />
        </div>
      </section>

      <section className={styles.section}>
        <h2 className="t-section">Table</h2>
        {data && (
          <DataTable
            caption="Buildings"
            columns={columns}
            rows={data.buildings}
            rowKey={(b) => b.id}
            sort={sort}
            onSort={setSort}
            selectedKey={target?.type === "building" ? target.id : null}
            onSelect={(b) => open("building", b.id)}
          />
        )}
      </section>
    </div>
  );
}
