/**
 * The hero analytic: one dot per night for 30 nights, the normal band from the
 * trailing 28 nights, and breaches marked with a warning glyph and a direct label.
 * Plus the benchmark dot plot.
 */
import { scaleLinear, scaleBand } from "d3-scale";
import { useEffect, useRef, useState } from "react";
import type { WaterView } from "@/api/types";
import { StatusGlyph } from "@/components/status/StatusGlyph";
import { formatDate, formatNumber } from "@/lib/format";
import styles from "@/components/charts/TimeChart.module.css";
import local from "./WaterPage.module.css";

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.floor(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function NightsChart({ nights, zone }: { nights: WaterView["nights"]; zone: string }) {
  const [ref, width] = useWidth();
  const [view, setView] = useState<"chart" | "table">("chart");
  const [hover, setHover] = useState<number | null>(null);
  const height = 220;
  const M = { top: 16, right: 16, bottom: 26, left: 52 };
  const pts = nights.points;
  const x = scaleBand<number>().domain(pts.map((_, i) => i)).range([M.left, width - M.right]);
  const vals = pts.flatMap((p) => [p.value ?? p.p50, p.p10, p.p90]);
  const y = scaleLinear().domain([Math.min(0, ...vals), Math.max(...vals) * 1.15]).nice(4).range([height - M.bottom, M.top]);
  const cx = (i: number) => x(i)! + x.bandwidth() / 2;
  // the band follows each night's trailing baseline
  const band = `M${pts.map((p, i) => `${cx(i)},${y(p.p90)}`).join(" L")} L${pts.map((_p, i) => `${cx(pts.length - 1 - i)},${y(pts[pts.length - 1 - i]!.p10)}`).join(" L")} Z`;
  const median = pts.map((p, i) => `${i ? "L" : "M"}${cx(i)},${y(p.p50)}`).join(" ");
  const h = hover !== null ? pts[hover] : null;
  return (
    <figure className={styles.figure}>
      <figcaption className={styles.caption}>
        <span>Overnight flow, {nights.name}, last 30 nights</span>
        <span className={styles.switch} role="group" aria-label="View">
          <button type="button" aria-pressed={view === "chart"} onClick={() => setView("chart")}>
            Chart
          </button>
          <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}>
            Table
          </button>
        </span>
      </figcaption>
      <div className={styles.legendRow}>
        <span>
          <span className={local.dotKey} aria-hidden /> Each night
        </span>
        <span>
          <span className={local.bandKey} aria-hidden /> Normal range, 10th to 90th percentile of the 28 nights before
        </span>
        <span>
          <StatusGlyph status="warning" size={10} /> 3 L/min or more above the usual
        </span>
      </div>
      <div ref={ref} className={styles.wrap}>
        {view === "table" ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Night</th>
                  <th scope="col" className={styles.num}>
                    Overnight flow (L/min)
                  </th>
                  <th scope="col" className={styles.num}>
                    Usual (L/min)
                  </th>
                  <th scope="col" className={styles.num}>
                    Normal range
                  </th>
                  <th scope="col">Breach</th>
                </tr>
              </thead>
              <tbody>
                {pts.map((p) => (
                  <tr key={p.night}>
                    <td>{formatDate(p.night, zone)}</td>
                    <td className={styles.num}>{p.value === null ? "No data" : formatNumber(p.value, 1)}</td>
                    <td className={styles.num}>{formatNumber(p.p50, 1)}</td>
                    <td className={styles.num}>
                      {formatNumber(p.p10, 1)} to {formatNumber(p.p90, 1)}
                    </td>
                    <td>{p.breach ? "Yes" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <svg width={width} height={height} role="img" aria-label="Overnight flow for each of the last 30 nights against the normal range. The table view lists every night." className={styles.svg}>
              {y.ticks(4).map((v) => (
                <g key={v}>
                  <line x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} className={styles.grid} />
                  <text x={M.left - 6} y={y(v) + 4} textAnchor="end" className={styles.tick}>
                    {formatNumber(v, 0)}
                  </text>
                </g>
              ))}
              <text x={M.left} y={M.top - 4} className={styles.panelUnit}>
                L/min
              </text>
              <path d={band} className={styles.band} />
              <path d={median} className={local.median} />
              {pts.map((p, i) => {
                const label = i % 7 === pts.length % 7 || i === pts.length - 1;
                return (
                  <g key={p.night} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} tabIndex={0} onFocus={() => setHover(i)} onBlur={() => setHover(null)} className={styles.barGroup} role="img" aria-label={`${formatDate(p.night, zone)}: ${p.value === null ? "no data" : `${formatNumber(p.value, 1)} L/min`}${p.breach ? ", above the usual" : ""}`}>
                    <rect x={x(i)} y={M.top} width={x.bandwidth()} height={height - M.top - M.bottom} fill="transparent" />
                    {p.value !== null && <circle cx={cx(i)} cy={y(p.value)} r={4} className={local.dot} />}
                    {p.breach && p.value !== null && (
                      <>
                        <g transform={`translate(${cx(i) - 6},${y(p.value) - 20})`}>
                          <StatusGlyph status="warning" size={12} />
                        </g>
                        <text x={cx(i) - 10} y={y(p.value) - 8} textAnchor="end" className={styles.thresholdLabel}>
                          {formatNumber(p.value, 1)} L/min
                        </text>
                      </>
                    )}
                    {label && (
                      <text x={cx(i)} y={height - 8} textAnchor="middle" className={styles.tick}>
                        {formatDate(p.night, zone, { year: false, weekday: false })}
                      </text>
                    )}
                  </g>
                );
              })}
              <line x1={M.left} x2={width - M.right} y1={height - M.bottom} y2={height - M.bottom} className={styles.axis} />
            </svg>
            {h && (
              <div className={styles.tooltip} style={{ left: Math.min(width - 210, cx(hover!) + 12), top: M.top }} role="status">
                <div className={styles.ttTime}>Night of {formatDate(h.night, zone)}</div>
                <div className={styles.ttRow}>
                  <strong>{h.value === null ? "No data" : `${formatNumber(h.value, 1)} L/min`}</strong>
                  <span className={styles.ttName}>overnight flow</span>
                </div>
                <div className={styles.ttRow}>
                  <strong>{formatNumber(h.p50, 1)} L/min</strong>
                  <span className={styles.ttName}>
                    usual, range {formatNumber(h.p10, 1)} to {formatNumber(h.p90, 1)}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </figure>
  );
}

export function BenchmarkPlot({ group }: { group: WaterView["benchmark"][number] }) {
  const [ref, width] = useWidth();
  const rowH = 26;
  const M = { left: 210, right: 64, top: 8, bottom: 22 };
  const height = M.top + group.rows.length * rowH + M.bottom;
  const max = Math.max(...group.rows.map((r) => r.perUnitL)) * 1.1;
  const x = scaleLinear().domain([0, max]).nice(4).range([M.left, Math.max(M.left + 80, width - M.right)]);
  const median = [...group.rows].sort((a, z) => a.perUnitL - z.perUnitL)[Math.floor(group.rows.length / 2)]!.perUnitL;
  return (
    <div ref={ref} className={styles.wrap}>
      <svg width={width} height={height} role="img" aria-label={`${group.unitLabel}: ${group.rows.map((r) => `${r.name} ${r.perUnitL}`).join(", ")}`} className={styles.svg}>
        {x.ticks(4).map((v) => (
          <g key={v}>
            <line x1={x(v)} x2={x(v)} y1={M.top} y2={height - M.bottom} className={styles.grid} />
            <text x={x(v)} y={height - 6} textAnchor="middle" className={styles.tick}>
              {formatNumber(v, 0)}
            </text>
          </g>
        ))}
        <line x1={x(median)} x2={x(median)} y1={M.top} y2={height - M.bottom} className={styles.threshold} />
        {group.rows.map((r, i) => {
          const y = M.top + i * rowH + rowH / 2;
          return (
            <g key={r.buildingId}>
              <text x={M.left - 10} y={y + 4} textAnchor="end" className={local.rowLabel}>
                {r.name}
              </text>
              <circle cx={x(r.perUnitL)} cy={y} r={5} className={local.dot} />
              <text x={x(r.perUnitL) + 10} y={y + 4} className={styles.tick}>
                {formatNumber(r.perUnitL, 0)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
