/**
 * Actual against expected: jade columns for what was used, an ink step line
 * for the usual. Columns are at most 24 px with a 4 px rounded data end and a
 * 2 px gap; each column is its own hover and focus target; table view included.
 */
import { scaleBand, scaleLinear } from "d3-scale";
import { useEffect, useRef, useState } from "react";
import { formatNumber } from "@/lib/format";
import styles from "./TimeChart.module.css";

export interface Bar {
  key: string;
  label: string; // axis label (may be blank to thin the axis)
  long: string; // full label for tooltip and table
  actual: number;
  expected: number;
}

interface Props {
  caption: string;
  bars: Bar[];
  unit: string;
  decimals?: number;
  height?: number;
  actualLabel?: string;
  expectedLabel?: string;
}

const M = { top: 12, right: 12, bottom: 24, left: 52 };

export function BarsChart({ caption, bars, unit, decimals = 1, height = 200, actualLabel = "Used", expectedLabel = "Usual" }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const [view, setView] = useState<"chart" | "table">("chart");
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.floor(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const x = scaleBand<number>().domain(bars.map((_, i) => i)).range([M.left, width - M.right]).paddingInner(0);
  const max = Math.max(1, ...bars.map((b) => Math.max(b.actual, b.expected)));
  const y = scaleLinear().domain([0, max * 1.08]).nice(4).range([height - M.bottom, M.top]);
  const bw = Math.min(24, Math.max(2, x.bandwidth() - 2));
  const step = bars.map((b, i) => `${i === 0 ? "M" : "L"}${x(i)!},${y(b.expected)} L${x(i)! + x.bandwidth()},${y(b.expected)}`).join(" ");
  const h = hover !== null ? bars[hover] : null;
  return (
    <figure className={styles.figure}>
      <figcaption className={styles.caption}>
        <span>{caption}</span>
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
          <span className={styles.swatchBar} aria-hidden /> {actualLabel}
        </span>
        <span>
          <span className={styles.swatchLine} aria-hidden /> {expectedLabel}
        </span>
      </div>
      <div ref={wrap} className={styles.wrap}>
        {view === "table" ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Period</th>
                  <th scope="col" className={styles.num}>
                    {actualLabel} ({unit})
                  </th>
                  <th scope="col" className={styles.num}>
                    {expectedLabel} ({unit})
                  </th>
                  <th scope="col" className={styles.num}>
                    Difference
                  </th>
                </tr>
              </thead>
              <tbody>
                {bars.map((b) => (
                  <tr key={b.key}>
                    <td>{b.long}</td>
                    <td className={styles.num}>{formatNumber(b.actual, decimals)}</td>
                    <td className={styles.num}>{formatNumber(b.expected, decimals)}</td>
                    <td className={styles.num}>{b.expected ? `${formatNumber(((b.actual - b.expected) / b.expected) * 100, 0)}%` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <svg width={width} height={height} role="img" aria-label={`${caption}. The table view lists every value.`} className={styles.svg}>
              {y.ticks(3).map((v) => (
                <g key={v}>
                  <line x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} className={styles.grid} />
                  <text x={M.left - 6} y={y(v) + 4} textAnchor="end" className={styles.tick}>
                    {formatNumber(v, v < 10 && v % 1 ? 1 : 0)}
                  </text>
                </g>
              ))}
              {bars.map((b, i) => {
                const cx = x(i)! + x.bandwidth() / 2;
                const top = y(b.actual);
                const base = y(0);
                const r = Math.min(4, bw / 2, base - top);
                const path = `M${cx - bw / 2},${base} V${top + r} Q${cx - bw / 2},${top} ${cx - bw / 2 + r},${top} H${cx + bw / 2 - r} Q${cx + bw / 2},${top} ${cx + bw / 2},${top + r} V${base} Z`;
                return (
                  <g
                    key={b.key}
                    tabIndex={0}
                    role="img"
                    aria-label={`${b.long}: ${formatNumber(b.actual, decimals)} ${unit}, usual ${formatNumber(b.expected, decimals)} ${unit}`}
                    onPointerEnter={() => setHover(i)}
                    onPointerLeave={() => setHover((hh) => (hh === i ? null : hh))}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    className={styles.barGroup}
                  >
                    <rect x={x(i)} y={M.top} width={x.bandwidth()} height={base - M.top} fill="transparent" />
                    <path d={path} className={hover === i ? styles.barHover : styles.bar} />
                    {b.label && (
                      <text x={cx} y={height - 8} textAnchor="middle" className={styles.tick}>
                        {b.label}
                      </text>
                    )}
                  </g>
                );
              })}
              <path d={step} className={styles.expected} />
              <line x1={M.left} x2={width - M.right} y1={y(0)} y2={y(0)} className={styles.axis} />
            </svg>
            {h && (
              <div className={styles.tooltip} style={{ left: Math.min(width - 190, Math.max(0, x(hover!)! + 16)), top: M.top }} role="status">
                <div className={styles.ttTime}>{h.long}</div>
                <div className={styles.ttRow}>
                  <span className={styles.ttKey} style={{ background: "var(--jade)", height: 8 }} aria-hidden />
                  <strong>
                    {formatNumber(h.actual, decimals)} {unit}
                  </strong>
                  <span className={styles.ttName}>{actualLabel.toLowerCase()}</span>
                </div>
                <div className={styles.ttRow}>
                  <span className={styles.ttKey} style={{ background: "var(--ink)" }} aria-hidden />
                  <strong>
                    {formatNumber(h.expected, decimals)} {unit}
                  </strong>
                  <span className={styles.ttName}>{expectedLabel.toLowerCase()}</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </figure>
  );
}
