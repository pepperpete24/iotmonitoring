/** /water: where is water being wasted? */
import { Link, useSearchParams } from "react-router-dom";
import { usePortfolioStatus, useWater } from "@/api/queries";
import { BarsChart } from "@/components/charts/BarsChart";
import { StatusGlyph } from "@/components/status/StatusGlyph";
import { BUILDING_TYPE_LABEL, type BuildingType } from "@/domain/common";
import { formatAUD, formatDate, formatNumber, formatTime } from "@/lib/format";
import { parseScope } from "@/shell/url";
import { BenchmarkPlot, NightsChart } from "./WaterCharts";
import styles from "./WaterPage.module.css";

export function WaterPage() {
  const [params, setParams] = useSearchParams();
  const scope = parseScope(params.get("scope"));
  const portfolio = usePortfolioStatus();
  const buildingId = params.get("building") ?? (scope.kind === "building" ? scope.id : undefined);
  const { data: w, isPending, isError, isFetching, refetch } = useWater(buildingId);

  if (isPending) return <div className={styles.page} aria-busy><h1 className="t-title">Water</h1><p className="soft">Adding up 30 days of readings</p></div>;
  if (isError || !w) {
    return (
      <div className={styles.page}>
        <h1 className="t-title">Water</h1>
        <p>Water use could not be loaded. Meters are still recording.</p>
        <button type="button" onClick={() => void refetch()}>Try again</button>
      </div>
    );
  }
  const zone = portfolio.data?.organisation.viewerZone ?? "Australia/Sydney";
  const pct = w.totals.usual30L ? Math.round((w.totals.last30L / w.totals.usual30L - 1) * 100) : 0;
  const hourly = w.hourly.map((h, i) => {
    const hr = Number(formatTime(h.t, zone).slice(0, 2));
    return { key: String(h.t), label: hr % 6 === 0 ? (hr === 0 ? formatDate(h.t, zone, { year: false }) : formatTime(h.t, zone)) : "", long: `${formatDate(h.t, zone, { year: false })}, ${formatTime(h.t, zone)} to ${formatTime(h.t + 3600_000, zone)}`, actual: h.actualL / 1000, expected: h.expectedL / 1000, i };
  });
  const daily = w.daily.map((d, i) => ({ key: String(d.day), label: i % 7 === 0 || (i === w.daily.length - 1 && i % 7 > 2) ? formatDate(d.day, zone, { year: false, weekday: false }) : "", long: formatDate(d.day, zone), actual: d.actualL / 1000, expected: d.expectedL / 1000 }));
  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className="t-title">Water</h1>
        <label className={styles.field}>
          <span>Show</span>
          <select
            value={buildingId ?? ""}
            onChange={(e) =>
              setParams((p) => {
                const n = new URLSearchParams(p);
                if (e.target.value) n.set("building", e.target.value);
                else n.delete("building");
                return n;
              })
            }
          >
            <option value="">All 16 buildings</option>
            {portfolio.data?.buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className={`t-briefing ${styles.summary}`}>
        {w.scope.name} used <strong>{formatNumber(w.totals.last30L / 1000, 0)} kL</strong> in the last 30 days, {Math.abs(pct) < 1 ? "in line with" : `${Math.abs(pct)}% ${pct > 0 ? "above" : "below"}`} the usual.
        That is about {formatAUD(Math.round(w.totals.cost30AUD))} at {formatAUD(w.tariffPerKL, { cents: true })}/kL. Metered leaks lost {formatNumber(w.totals.leakLossL / 1000, 2)} kL ({formatAUD(w.totals.leakCostAUD, { cents: true })}).
      </p>
      <p className="t-small">The tariff is illustrative and set in Settings. Times in {zone === "Australia/Sydney" ? "AEDT" : "the viewer's zone"}.</p>

      <div className={isFetching ? styles.refreshing : undefined}>
        <section className={styles.section}>
          <h2 className="t-section">Use against the usual</h2>
          <div className={styles.twoUp}>
            <BarsChart caption="Last 48 hours, by hour" bars={hourly} unit="kL" decimals={2} actualLabel="Used" expectedLabel="Usual for that weekday and hour" />
            <BarsChart caption="Last 30 days, by day" bars={daily} unit="kL" decimals={1} actualLabel="Used" expectedLabel="Usual for that weekday" />
          </div>
        </section>

        <section className={styles.section}>
          <h2 className="t-section">Overnight baseline</h2>
          <p className="t-prose soft">
            Between 01:00 and 04:00 almost nothing should run, so water that flows then is usually a leak. Each dot is one night's figure: the median of the six
            half-hour averages in that window.
          </p>
          {!buildingId && <p className="t-small">Showing {w.nights.name}. Choose a building above to see its own baseline.</p>}
          <NightsChart nights={w.nights} zone={zone} />
        </section>

        <section className={styles.section}>
          <h2 className="t-section">Anomalies, last 30 nights</h2>
          {w.anomalies.length ? (
            <table className={styles.table}>
              <caption className="visually-hidden">Nights with flow 3 L/min or more above the building's usual</caption>
              <thead>
                <tr>
                  <th scope="col">Night</th>
                  <th scope="col">Building</th>
                  <th scope="col" className={styles.num}>
                    Overnight flow
                  </th>
                  <th scope="col" className={styles.num}>
                    Usual
                  </th>
                  <th scope="col" className={styles.num}>
                    Above usual
                  </th>
                  <th scope="col">Incident</th>
                </tr>
              </thead>
              <tbody>
                {w.anomalies.map((a) => (
                  <tr key={`${a.buildingId}-${a.night}`}>
                    <td>{formatDate(a.night, zone)}</td>
                    <td>
                      <Link to={`/buildings/${a.buildingId}`}>{a.name}</Link>
                    </td>
                    <td className={styles.num}>{formatNumber(a.value, 1)} L/min</td>
                    <td className={styles.num}>{formatNumber(a.baseline, 1)} L/min</td>
                    <td className={styles.num}>
                      <StatusGlyph status="warning" size={10} /> {formatNumber(a.excess, 1)} L/min
                    </td>
                    <td>{a.incidentId ? <Link to={`/incidents/${a.incidentId}`}>{a.incidentId}</Link> : <span className="soft">No incident raised</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="soft">No night in the last 30 ran 3 L/min or more above its usual. Anomalies appear here the morning after.</p>
          )}
        </section>

        <section className={styles.section}>
          <h2 className="t-section">Benchmark, last 7 days</h2>
          <p className="t-prose soft">Buildings compared with others of the same type. Use is divided by the size that drives it, stated above each chart. The dashed line is the median.</p>
          <div className={styles.benchGrid}>
            {w.benchmark.map((g) => (
              <figure key={g.type} className={styles.bench}>
                <figcaption>
                  <strong>{BUILDING_TYPE_LABEL[g.type as BuildingType] ?? g.type}</strong>, {g.unitLabel.toLowerCase()}
                </figcaption>
                <BenchmarkPlot group={g} />
              </figure>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
