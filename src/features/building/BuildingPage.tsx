/** /buildings/:id: what is happening in this building? */
import * as Tabs from "@radix-ui/react-tabs";
import { useParams, useSearchParams } from "react-router-dom";
import { useBuilding } from "@/api/queries";
import { Annunciator } from "@/components/Annunciator";
import { Segmented } from "@/components/Button";
import { formatDate, formatTimeZoned } from "@/lib/format";
import { usePhone } from "@/lib/useMedia";
import { useInspect } from "@/shell/url";
import { useSimNow } from "@/state/clock";
import { LAYER_LABEL, type Layer } from "./riserLayout";
import { RiserDiagram } from "./RiserDiagram";
import { RiserList } from "./RiserList";
import { statusSentence } from "./statusSentence";
import { ChartsTab, DetailsTab, DevicesTab, IncidentsTab, MaintenanceTab, OverviewTab } from "./tabs";
import styles from "./BuildingPage.module.css";

const TABS = ["overview", "charts", "devices", "incidents", "maintenance", "details"] as const;
type TabKey = (typeof TABS)[number];
const TAB_LABEL: Record<TabKey, string> = {
  overview: "Overview",
  charts: "Charts",
  devices: "Devices",
  incidents: "Incidents",
  maintenance: "Maintenance",
  details: "Details",
};

export function BuildingPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { data: b, isPending, isError, isFetching } = useBuilding(id);
  const now = useSimNow();
  const phone = usePhone();
  const { target, open } = useInspect();
  const layer = (params.get("layer") as Layer) || "flow";
  const tab = (params.get("tab") as TabKey) || "overview";
  const set = (k: string, v: string, dflt: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v === dflt) n.delete(k);
        else n.set(k, v);
        return n;
      },
      { replace: true },
    );

  if (isPending) {
    return (
      <div className={styles.page} aria-busy>
        <p className={styles.loading}>Loading the building and its devices</p>
      </div>
    );
  }
  if (isError || !b) {
    return (
      <div className={styles.page}>
        <h1 className="t-title">Building not found</h1>
        <p className="t-body t-prose">No building matches this link. Choose one from the list of buildings, or open the portfolio.</p>
      </div>
    );
  }

  const s = b.summary;
  const selectedDevice = target?.type === "device" ? target.id : null;
  const facts = [
    b.typeLabel,
    b.campusBuildings ? `${b.campusBuildings} buildings` : `${b.levelsAbove} levels${b.basements ? `, ${b.basements} ${b.basements === 1 ? "basement" : "basements"}` : ""}`,
    b.occupancy,
  ];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h1 className="t-title">{s.name}</h1>
          <p className={styles.localTime}>
            <time dateTime={new Date(now).toISOString()}>
              {formatDate(now, s.zone)}, {formatTimeZoned(now, s.zone)}
            </time>
          </p>
        </div>
        <p className={styles.facts}>
          {s.address}, {s.suburb} {s.state}. {facts.join(". ")}.
        </p>
        <Annunciator state={s.annunciator} label={s.name} />
        <p className={`t-briefing ${styles.sentence}`}>{statusSentence(b, now)}</p>
      </header>

      <section className={styles.drawing} aria-label="Riser diagram">
        <div className={styles.drawingBar}>
          <Segmented<Layer>
            label="Layer"
            value={layer}
            onChange={(v) => set("layer", v, "flow")}
            options={(Object.keys(LAYER_LABEL) as Layer[]).map((k) => ({ value: k, label: LAYER_LABEL[k] }))}
          />
          {!phone && <span className="t-small">Hold Ctrl and scroll to zoom. Drag to pan.</span>}
        </div>
        {phone ? (
          <RiserList building={b} layer={layer} selectedId={selectedDevice} onSelect={(d) => open("device", d)} />
        ) : (
          <div className={isFetching ? styles.refreshing : undefined}>
            <RiserDiagram building={b} layer={layer} now={now} selectedId={selectedDevice} onSelect={(d) => open("device", d)} />
          </div>
        )}
      </section>

      <Tabs.Root value={tab} onValueChange={(v) => set("tab", v, "overview")} className={styles.tabs}>
        <Tabs.List className={styles.tabList} aria-label="Building views">
          {TABS.map((t) => (
            <Tabs.Trigger key={t} value={t} className={styles.tab}>
              {TAB_LABEL[t]}
              {t === "incidents" && s.openIncidents > 0 && <span className={styles.count}> {s.openIncidents} open</span>}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="overview" className={styles.panel}>
          <OverviewTab b={b} />
        </Tabs.Content>
        <Tabs.Content value="charts" className={styles.panel}>
          <ChartsTab b={b} />
        </Tabs.Content>
        <Tabs.Content value="devices" className={styles.panel}>
          <DevicesTab b={b} />
        </Tabs.Content>
        <Tabs.Content value="incidents" className={styles.panel}>
          <IncidentsTab b={b} />
        </Tabs.Content>
        <Tabs.Content value="maintenance" className={styles.panel}>
          <MaintenanceTab b={b} />
        </Tabs.Content>
        <Tabs.Content value="details" className={styles.panel}>
          <DetailsTab b={b} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
