/** /reports/monthly: the monthly portfolio report, an A4 document for owners and insurers. */
import { Link, useSearchParams } from "react-router-dom";
import { useMonthlyReport } from "@/api/queries";
import { formatAUD, formatDate, formatDateTime, formatDuration, formatNumber, MINUTE } from "@/lib/format";
import { brand } from "@/brand";
import { incidentHeadline } from "@/lib/headline";
import { ReportFrame, Sheet } from "./ReportFrame";
import styles from "./Report.module.css";

const kl = (l: number) => formatNumber(l / 1000, 2);
const mins = (m: number | null) => (m === null ? "No acknowledged incidents" : formatDuration(m * MINUTE));

export function MonthlyReportPage() {
  const [params, setParams] = useSearchParams();
  const month = params.get("month") ?? "2026-10";
  const { data: r, isPending, isError } = useMonthlyReport(month);
  const toolbar = r && (
    <label>
      <span className="visually-hidden">Month</span>
      <select className={styles.select} value={month} onChange={(e) => setParams({ month: e.target.value })}>
        {r.months.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
    </label>
  );
  if (isPending) return <ReportFrame title="Monthly report"><p className="soft">Preparing the report</p></ReportFrame>;
  if (isError || !r) return <ReportFrame title="Monthly report"><p>The report could not be prepared. Choose another month or try again.</p></ReportFrame>;
  const t = r.totals;
  const z = r.zone;
  const footer = `${r.organisation}. Building protection report, ${r.label}. Prepared ${formatDateTime(r.preparedAt, z)} from the ${brand.name} incident record.`;
  const firstDay = formatDate(r.from, z);
  const lastDay = formatDate(Math.min(r.to, r.preparedAt) - 1, z);
  const tariff = formatAUD(r.tariffPerKL, { cents: true });
  return (
    <ReportFrame title={`Monthly report, ${r.label}`} toolbar={toolbar}>
      <Sheet footer={footer}>
        <header className={styles.titleBlock}>
          <p className={styles.docType}>Building protection report</p>
          <div className={styles.docMeta}>
            {r.organisation}
            <br />
            {firstDay} to {lastDay}
            <br />
            Prepared {formatDate(r.preparedAt, z)}
          </div>
          <h2 className={styles.docTitle}>{r.label}</h2>
        </header>

        <p className={styles.lead}>
          {t.incidents === 0 ? (
            <>No incidents were raised in {r.label}.</>
          ) : (
            <>
              <strong>{t.incidents} incidents</strong> across {t.buildingsAffected} of 16 buildings, {t.critical} of them critical
              {t.falseAlarms ? ` and ${t.falseAlarms} closed as ${t.falseAlarms === 1 ? "a false alarm" : "false alarms"}` : ""}. Incidents were acknowledged in a median of{" "}
              <strong>{mins(t.medianAckBusinessMin)}</strong> in business hours and <strong>{mins(t.medianAckAfterMin)}</strong> after hours. Metered water lost was{" "}
              <strong>{kl(t.waterLostL)} kL</strong>, about {formatAUD(t.costAUD, { cents: true })} at {tariff}/kL.
              {t.slowest && t.slowest.ackMin > 60 && (
                <>
                  {" "}
                  The slowest response was {t.slowest.incidentId} at {t.slowest.buildingName}, acknowledged after {formatDuration(t.slowest.ackMin * MINUTE)}.
                </>
              )}
            </>
          )}
        </p>

        <section className={styles.section}>
          <h3 className={styles.h2}>By type</h3>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col" className={styles.num}>Incidents</th>
                <th scope="col" className={styles.num}>Critical</th>
                <th scope="col" className={styles.num}>Water lost, kL</th>
              </tr>
            </thead>
            <tbody>
              {r.byCategory.map((c) => (
                <tr key={c.category}>
                  <td>{c.label}</td>
                  <td className={styles.num}>{c.count}</td>
                  <td className={styles.num}>{c.critical}</td>
                  <td className={styles.num}>{c.waterLostL ? kl(c.waterLostL) : ""}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className={styles.num}>{t.incidents}</td>
                <td className={styles.num}>{t.critical}</td>
                <td className={styles.num}>{kl(t.waterLostL)}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        <section className={styles.section}>
          <h3 className={styles.h2}>By building</h3>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Building</th>
                <th scope="col" className={styles.num}>Incidents</th>
                <th scope="col" className={styles.num}>Critical</th>
                <th scope="col" className={styles.num}>Water lost, kL</th>
              </tr>
            </thead>
            <tbody>
              {r.byBuilding.map((b) => (
                <tr key={b.buildingId}>
                  <td>{b.name}</td>
                  <td className={styles.num}>{b.count}</td>
                  <td className={styles.num}>{b.critical}</td>
                  <td className={styles.num}>{b.waterLostL ? kl(b.waterLostL) : ""}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className={styles.num}>{t.incidents}</td>
                <td className={styles.num}>{t.critical}</td>
                <td className={styles.num}>{kl(t.waterLostL)}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        {t.largestLoss && (
          <section className={styles.section}>
            <h3 className={styles.h2}>Largest event</h3>
            {(() => {
              const i = r.incidents.find((x) => x.id === t.largestLoss!.incidentId)!;
              return (
                <p className={styles.callout}>
                  <strong>
                    {i.id}, {i.buildingName}.
                  </strong>{" "}
                  {i.title}, {i.location}, opened {formatDateTime(i.openedAt, i.zone)}. Acknowledged after {i.ackMin !== null ? formatDuration(i.ackMin * MINUTE) : "no acknowledgement"};{" "}
                  {i.resolvedAt ? `resolved after ${formatDuration(i.resolvedAt - i.openedAt)}` : "still open"}. {kl(i.waterLostL!)} kL lost, {formatAUD(i.costAUD!, { cents: true })} of water. The full record is in the incident report for {i.id}.
                </p>
              );
            })()}
          </section>
        )}
      </Sheet>

      <Sheet footer={footer}>
        <section className={styles.section}>
          <h3 className={styles.h2}>Every incident in {r.label}</h3>
          <p className={styles.note}>Times are in each building's local zone. Daylight saving began in NSW, VIC, SA and TAS on Sun 4 Oct 2026; earlier times read AEST or ACST.</p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Incident</th>
                <th scope="col">Building</th>
                <th scope="col">What and where</th>
                <th scope="col">Opened</th>
                <th scope="col" className={styles.num}>To acknowledge</th>
                <th scope="col" className={styles.num}>To resolve</th>
                <th scope="col" className={styles.num}>Water, kL</th>
              </tr>
            </thead>
            <tbody>
              {r.incidents.map((i) => (
                <tr key={i.id}>
                  <td>
                    <Link to={`/reports/incident/${i.id}`}>{i.id}</Link>
                    <br />
                    {i.peakSeverity === "critical" ? "Critical" : "Warning"}
                  </td>
                  <td>{i.buildingName}</td>
                  <td>
                    {incidentHeadline(i.title, i.location)}
                    {i.resolution === "false-alarm" ? ". False alarm" : ""}
                  </td>
                  <td>{formatDateTime(i.openedAt, i.zone, { year: false })}</td>
                  <td className={styles.num}>{i.ackMin === null ? "Closed itself" : formatDuration(i.ackMin * MINUTE)}</td>
                  <td className={styles.num}>{i.resolvedAt ? formatDuration(i.resolvedAt - i.openedAt) : "Open"}</td>
                  <td className={styles.num}>{i.waterLostL !== null ? kl(i.waterLostL) : ""}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6}>
                  {t.incidents} incidents. Metered water lost, at {tariff}/kL: {formatAUD(t.costAUD, { cents: true })}
                </td>
                <td className={styles.num}>{kl(t.waterLostL)}</td>
              </tr>
            </tfoot>
          </table>
        </section>
        <section className={styles.section}>
          <h3 className={styles.h2}>About this report</h3>
          <p className={styles.note}>
            This report is a record of what the monitoring platform observed and what people did in response. It is evidence to support maintenance and
            insurance conversations; it does not certify the condition of any building. Thresholds are set by {r.organisation}. Water volumes are measured by
            meters; leaks seen only by a leak sensor are not metered and show no volume. The water tariff is illustrative. Water damage is not priced.
          </p>
        </section>
      </Sheet>
    </ReportFrame>
  );
}
