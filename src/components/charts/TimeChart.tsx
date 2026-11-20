/**
 * Time series on one shared axis. Stacked small multiples share the time
 * axis and one cursor; each panel has its own y axis (never a dual axis).
 * Offline periods are hatched gaps and never interpolated. Thresholds are
 * labelled lines. The overnight window can be shaded. Events sit on the
 * axis. Every chart has a table view.
 */
import { scaleLinear, scaleTime } from "d3-scale";
import { line as d3line } from "d3-shape";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Status } from "@/domain/common";
import { formatDateTime, formatNumber, formatTimeZoned } from "@/lib/format";
import { StatusGlyph } from "@/components/status/StatusGlyph";
import { overnightWindows, timeTicks } from "./timeAxis";
import styles from "./TimeChart.module.css";

export interface ChartPanel {
  id: string;
  title: string;
  unit: string;
  /** CSS colour for the mark: a measure token, or ink. */
  color: string;
  kind?: "line" | "state";
  points: Array<[number, number | null]>;
  decimals?: number;
  thresholds?: Array<{ value: number; label: string }>;
  /** A band drawn behind the line, for example the normal range. */
  band?: { from: number; to: number; label: string };
  yMin?: number;
  /** Words for 0 and 1 on a state panel: ["Dry", "Wet"]. */
  states?: [string, string];
  gaps?: Array<{ from: number; to: number; reason: string }>;
}

export interface ChartEvent {
  t: number;
  label: string;
  status?: Status;
}

interface Props {
  panels: ChartPanel[];
  from: number;
  to: number;
  zone: string;
  caption: string;
  events?: ChartEvent[];
  overnight?: boolean;
  panelHeight?: number;
  /** Show the chart/table switch. */
  tableToggle?: boolean;
  /** Dim while a refetch is in flight. */
  stale?: boolean;
}

const M = { top: 8, right: 16, bottom: 24, left: 52 };
const STATE_H = 22;

export function TimeChart({ panels, from, to, zone, caption, events = [], overnight, panelHeight = 120, tableToggle = true, stale }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [cursor, setCursor] = useState<number | null>(null);
  const [view, setView] = useState<"chart" | "table">("chart");
  const hatch = useId().replace(/:/g, "");

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.floor(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const x = useMemo(() => scaleTime().domain([from, to]).range([M.left, width - M.right]), [from, to, width]);
  const ticks = useMemo(() => timeTicks(from, to, zone, Math.max(3, Math.floor(width / 110))), [from, to, zone, width]);
  const nights = useMemo(() => (overnight ? overnightWindows(from, to, zone) : []), [overnight, from, to, zone]);

  const layout = panels.map((p, i) => {
    const h = p.kind === "state" ? STATE_H : panelHeight;
    return { p, h, i };
  });
  let yOff = M.top;
  const placed = layout.map((l) => {
    const top = yOff;
    yOff += l.h + (l.p.kind === "state" ? 26 : 34);
    return { ...l, top };
  });
  const plotBottom = yOff - 18;
  const eventsY = plotBottom + 2;
  const height = plotBottom + (events.length ? 30 : 0) + M.bottom;

  // the cursor snaps to the first panel's points
  const xs = panels[0]?.points.map((pt) => pt[0]) ?? [];
  const nearest = (t: number) => {
    let best = 0;
    for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i]! - t) < Math.abs(xs[best]! - t)) best = i;
    return best;
  };

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    if (px < M.left || px > width - M.right) return setCursor(null);
    setCursor(nearest(x.invert(px).getTime()));
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!xs.length) return;
    const step = e.shiftKey ? 10 : 1;
    if (e.key === "ArrowRight") setCursor((c) => Math.min(xs.length - 1, (c ?? -1) + step));
    else if (e.key === "ArrowLeft") setCursor((c) => Math.max(0, (c ?? xs.length) - step));
    else if (e.key === "Home") setCursor(0);
    else if (e.key === "End") setCursor(xs.length - 1);
    else if (e.key === "Escape") setCursor(null);
    else return;
    e.preventDefault();
  };

  const cursorT = cursor !== null ? xs[cursor] : null;

  return (
    <figure className={`${styles.figure} ${stale ? styles.stale : ""}`}>
      <figcaption className={styles.caption}>
        <span>{caption}</span>
        {tableToggle && (
          <span className={styles.switch} role="group" aria-label="View">
            <button type="button" aria-pressed={view === "chart"} onClick={() => setView("chart")}>
              Chart
            </button>
            <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}>
              Table
            </button>
          </span>
        )}
      </figcaption>
      <div ref={wrap} className={styles.wrap}>
        {view === "table" ? (
          <ChartTable panels={panels} zone={zone} />
        ) : (
          <>
            <svg
              width={width}
              height={height}
              role="img"
              aria-label={`${caption}. Use the left and right arrow keys to read values; the table view lists them all.`}
              tabIndex={0}
              onPointerMove={onMove}
              onPointerLeave={() => setCursor(null)}
              onKeyDown={onKey}
              onBlur={() => setCursor(null)}
              className={styles.svg}
            >
              <defs>
                <pattern id={hatch} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="5" className={styles.hatchLine} strokeWidth="1" />
                </pattern>
              </defs>

              {nights.map((n, i) => (
                <g key={i}>
                  <rect x={x(n.from)} y={M.top} width={Math.max(0, x(n.to) - x(n.from))} height={plotBottom - M.top} className={styles.night} />
                  {i === 0 && x(n.to) - x(n.from) > 60 && (
                    <text x={x(n.from) + 4} y={M.top + 11} className={styles.nightLabel}>
                      01:00 to 04:00
                    </text>
                  )}
                </g>
              ))}

              {placed.map(({ p, h, top }) => (
                <Panel key={p.id} p={p} x={x} top={top} h={h} width={width} hatchId={hatch} />
              ))}

              {/* time axis */}
              <line x1={M.left} x2={width - M.right} y1={plotBottom} y2={plotBottom} className={styles.axis} />
              {ticks.map((t) => (
                <g key={t.t} transform={`translate(${x(t.t)},${plotBottom})`}>
                  <line y1={0} y2={4} className={styles.axis} />
                  <text y={16} textAnchor="middle" className={t.major ? styles.tickMajor : styles.tick}>
                    {t.label}
                  </text>
                </g>
              ))}

              {/* events on the axis */}
              {events.map((ev, i) => {
                const ex = x(ev.t);
                if (ex < M.left || ex > width - M.right) return null;
                return (
                  <g key={i}>
                    <line x1={ex} x2={ex} y1={M.top} y2={eventsY + 18} className={styles.eventLine} />
                    <g transform={`translate(${ex - 6},${eventsY + 20})`}>
                      {ev.status ? <StatusGlyph status={ev.status} size={12} /> : <circle cx="6" cy="6" r="4" className={styles.eventDot} />}
                    </g>
                  </g>
                );
              })}

              {cursorT !== null && cursorT !== undefined && (
                <line x1={x(cursorT)} x2={x(cursorT)} y1={M.top} y2={plotBottom} className={styles.cursor} />
              )}
              {cursorT !== null &&
                cursorT !== undefined &&
                placed.map(({ p, h, top }) => {
                  const v = p.points[cursor!]?.[1];
                  if (v === null || v === undefined || p.kind === "state") return null;
                  const y = yScale(p, top, h)(v);
                  return <circle key={p.id} cx={x(cursorT)} cy={y} r={4} className={styles.dot} style={{ fill: p.color }} />;
                })}
            </svg>

            {events.length > 0 && (
              <ul className={styles.eventKey}>
                {events.map((ev, i) => (
                  <li key={i}>
                    {ev.status ? <StatusGlyph status={ev.status} size={10} /> : <span className={styles.eventKeyDot} aria-hidden />}
                    <span>
                      {ev.label} {formatTimeZoned(ev.t, zone)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {cursorT !== null && cursorT !== undefined && (
              <div
                className={styles.tooltip}
                style={{ left: Math.min(width - 200, Math.max(0, x(cursorT) + 12)), top: M.top }}
                role="status"
              >
                <div className={styles.ttTime}>{formatDateTime(cursorT, zone, { year: false })}</div>
                {panels.map((p) => {
                  const v = p.points[cursor!]?.[1];
                  const gap = p.gaps?.find((g) => cursorT >= g.from && cursorT < g.to);
                  return (
                    <div key={p.id} className={styles.ttRow}>
                      <span className={styles.ttKey} style={{ background: p.color }} aria-hidden />
                      <strong>{gap || v === null || v === undefined ? "No data" : p.kind === "state" ? (p.states?.[v ? 1 : 0] ?? String(v)) : `${formatNumber(v, p.decimals ?? 1)} ${p.unit}`}</strong>
                      <span className={styles.ttName}>{gap ? `${p.title}, ${gap.reason.toLowerCase()}` : p.title}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </figure>
  );
}

function yScale(p: ChartPanel, top: number, h: number) {
  if (p.kind === "state") return scaleLinear().domain([0, 1]).range([top + h, top]);
  const vals = p.points.map((pt) => pt[1]).filter((v): v is number => v !== null);
  for (const t of p.thresholds ?? []) vals.push(t.value);
  if (p.band) vals.push(p.band.from, p.band.to);
  const lo = Math.min(p.yMin ?? Infinity, ...vals);
  const hi = Math.max(...vals);
  const pad = (hi - lo || 1) * 0.08;
  return scaleLinear()
    .domain([p.yMin !== undefined ? p.yMin : lo - pad, hi + pad])
    .nice(4)
    .range([top + h, top]);
}

function Panel({ p, x, top, h, width, hatchId }: { p: ChartPanel; x: (t: number) => number; top: number; h: number; width: number; hatchId: string }) {
  const y = yScale(p, top, h);
  const right = width - M.right;
  const gaps = (p.gaps ?? []).map((g, i) => (
    <rect key={i} x={x(g.from)} y={top} width={Math.max(1, x(g.to) - x(g.from))} height={h} fill={`url(#${hatchId})`} className={styles.gap} />
  ));
  if (p.kind === "state") {
    // runs of 1 drawn as filled blocks: wet means water present, so jade
    const runs: Array<[number, number]> = [];
    let start: number | null = null;
    p.points.forEach(([t, v], i) => {
      if (v === 1 && start === null) start = t;
      const next = p.points[i + 1]?.[0] ?? t;
      if ((v !== 1 || i === p.points.length - 1) && start !== null) {
        runs.push([start, v === 1 ? next : t]);
        start = null;
      }
    });
    return (
      <g>
        <text x={M.left} y={top - 6} className={styles.panelTitle}>
          {p.title}
        </text>
        <rect x={M.left} y={top} width={right - M.left} height={h} className={styles.stateTrack} />
        {runs.map(([a, b], i) => (
          <rect key={i} x={x(a)} y={top + 2} width={Math.max(2, x(b) - x(a))} height={h - 4} style={{ fill: p.color }} />
        ))}
        {gaps}
        <text x={M.left - 6} y={top + h / 2 + 4} textAnchor="end" className={styles.tick}>
          {p.states?.[1] ?? "On"}
        </text>
      </g>
    );
  }
  const path = d3line<[number, number | null]>()
    .defined((d) => d[1] !== null)
    .x((d) => x(d[0]))
    .y((d) => y(d[1]!))(p.points);
  const yt = y.ticks(3);
  return (
    <g>
      <text x={M.left} y={top - 8} className={styles.panelTitle}>
        {p.title}
        <tspan className={styles.panelUnit}> {p.unit}</tspan>
      </text>
      {yt.map((v) => (
        <g key={v}>
          <line x1={M.left} x2={right} y1={y(v)} y2={y(v)} className={styles.grid} />
          <text x={M.left - 6} y={y(v) + 4} textAnchor="end" className={styles.tick}>
            {formatNumber(v, Math.abs(v) < 10 && v % 1 ? 1 : 0)}
          </text>
        </g>
      ))}
      {p.band && (
        <g>
          <rect x={M.left} y={y(p.band.to)} width={right - M.left} height={Math.max(1, y(p.band.from) - y(p.band.to))} className={styles.band} />
          <text x={right - 4} y={y(p.band.to) - 4} textAnchor="end" className={styles.thresholdLabel}>
            {p.band.label}
          </text>
        </g>
      )}
      {gaps}
      {path && <path d={path} className={styles.line} style={{ stroke: p.color }} />}
      {(p.thresholds ?? []).map((t) => (
        <g key={t.label}>
          <line x1={M.left} x2={right} y1={y(t.value)} y2={y(t.value)} className={styles.threshold} />
          <text x={right - 4} y={y(t.value) - 4} textAnchor="end" className={styles.thresholdLabel}>
            {t.label}
          </text>
        </g>
      ))}
    </g>
  );
}

function ChartTable({ panels, zone }: { panels: ChartPanel[]; zone: string }) {
  const first = panels[0]?.points ?? [];
  const every = Math.max(1, Math.ceil(first.length / 240));
  const rows = first.map((_, i) => i).filter((i) => i % every === 0);
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Time</th>
            {panels.map((p) => (
              <th key={p.id} scope="col" className={styles.num}>
                {p.title} {p.kind === "state" ? "" : `(${p.unit})`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i}>
              <td>{formatDateTime(first[i]![0], zone, { year: false })}</td>
              {panels.map((p) => {
                const v = p.points[i]?.[1];
                return (
                  <td key={p.id} className={styles.num}>
                    {v === null || v === undefined ? "No data" : p.kind === "state" ? (p.states?.[v ? 1 : 0] ?? v) : formatNumber(v, p.decimals ?? 1)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
