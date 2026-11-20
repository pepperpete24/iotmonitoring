/**
 * The riser diagram: a vertical section through the building drawn as a
 * hydraulic riser schematic, generated from the building's topology.
 * The memorable element of the product; everything around it stays quiet.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import type { BuildingDetail, DeviceLive } from "@/api/types";
import { symbolByKind, SYMBOLS, type SymbolKind } from "@/components/symbols/symbols";
import { StatusGlyph } from "@/components/status/StatusGlyph";
import { formatNumber, formatTimeZoned } from "@/lib/format";
import { LABEL_W, LAYER_LABEL, type Layer, layoutRiser, pipeExtent, type Placed } from "./riserLayout";
import styles from "./RiserDiagram.module.css";

const LAYER_MEASURES: Record<Layer, string[]> = {
  flow: ["flow", "level", "duty", "valve", "wet"],
  pressure: ["pressure", "valve", "wet"],
  temperature: ["temperature", "door", "wet"],
  health: [],
};

const MEASURE_COLOR: Record<string, string> = {
  flow: "var(--jade)",
  level: "var(--jade)",
  duty: "var(--ink)",
  pressure: "var(--gauge)",
  temperature: "var(--thermal)",
};

interface Props {
  building: BuildingDetail;
  layer: Layer;
  now: number;
  selectedId: string | null;
  onSelect: (deviceId: string) => void;
}

/** The value a device shows in a layer, or null if it has nothing to say there. */
export function displayValue(d: DeviceLive, layer: Layer): { text: string; unit: string; measure: string } | null {
  if (d.status === "offline") return { text: "Offline", unit: "", measure: "" };
  if (layer === "health") {
    if (d.kind === "gateway") return { text: d.status === "paused" ? "Paused" : "Online", unit: "", measure: "" };
    return { text: `${formatNumber(d.battery, 0)}%`, unit: `${d.rssi} dBm`, measure: "" };
  }
  const wanted = LAYER_MEASURES[layer];
  const r = d.readings.find((x) => wanted.includes(x.measure));
  if (!r) return null;
  switch (r.measure) {
    case "wet":
      return r.value ? { text: "Wet", unit: "", measure: "wet" } : null;
    case "door":
      return { text: r.value ? "Open" : "Closed", unit: "", measure: "door" };
    case "valve":
      return { text: r.value ? "Closed" : "Open", unit: "", measure: "valve" };
    case "duty":
      return { text: formatNumber(r.value, 0), unit: "% duty", measure: "duty" };
    default:
      return { text: formatNumber(r.value, r.measure === "pressure" || r.measure === "level" ? 0 : 1), unit: r.unit, measure: r.measure };
  }
}

export function itemStatus(d: DeviceLive) {
  if (d.alert) return d.alert;
  if (d.status === "offline") return "offline" as const;
  if (d.status === "muted") return "muted" as const;
  return null;
}

/** What a screen reader hears after the visible name: kind, place, hidden value, status. */
export function accessibleDescription(d: DeviceLive, layer: Layer, compact = d.kind === "leak-sensor" || d.kind === "door-contact"): string {
  const v = displayValue(d, layer);
  const st = itemStatus(d);
  const value = v ? `${v.text} ${v.unit}`.trim() : null;
  return [d.kindLabel.toLowerCase(), d.location, compact ? value : null, st ? (st === "muted" ? "muted" : st) : null].filter(Boolean).join(", ");
}

export function accessibleName(d: DeviceLive, layer: Layer, compact = d.kind === "leak-sensor" || d.kind === "door-contact"): string {
  const v = displayValue(d, layer);
  const st = itemStatus(d);
  const value = v ? `${v.text} ${v.unit}`.trim() : null;
  // what is visible comes first, in the order it is shown, so voice control can find it
  const head = compact || !value ? d.tag : `${d.tag} ${value}`;
  return [head, d.kindLabel.toLowerCase(), d.location, compact ? value : null, st ? (st === "muted" ? "muted" : st) : null].filter(Boolean).join(", ");
}

export function RiserDiagram({ building, layer, now, selectedId, onSelect }: Props) {
  const lay = useMemo(() => layoutRiser(building), [building]);
  const box = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(900);
  const [zoom, setZoom] = useState<number | null>(null); // null: fit to width
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hoverRow, setHoverRow] = useState<number | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const hatch = useId().replace(/:/g, "");
  const idBase = `riser-${hatch}`;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBoxW(Math.floor(e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit to width, but never below 90%: past that the drawing scrolls inside its frame.
  const fit = Math.max(0.9, Math.min(1, boxW / lay.width));
  const scale = zoom ?? fit;
  const titleBlockH = 150;
  const contentH = lay.height + titleBlockH + 16;
  const viewH = contentH * scale;

  const zoomBy = (f: number) => setZoom((z) => Math.max(0.4, Math.min(2.5, (z ?? fit) * f)));
  // Fit shows the whole drawing, however small; the default view keeps text at 90% or more.
  const resetView = () => {
    setZoom(Math.min(1, boxW / lay.width));
    setPan({ x: 0, y: 0 });
  };

  // roving focus across items, ordered top to bottom then left to right
  const ordered = useMemo(() => [...lay.items].sort((a, z) => a.row - z.row || a.x - z.x), [lay.items]);
  const tabbable = focusId ?? selectedId ?? ordered[0]?.device.id ?? null;
  const focusItem = (id: string) => {
    setFocusId(id);
    requestAnimationFrame(() => box.current?.querySelector<SVGGElement>(`[data-device="${CSS.escape(id)}"]`)?.focus());
  };
  const onItemKey = (e: React.KeyboardEvent, it: Placed) => {
    const sameRow = ordered.filter((o) => o.row === it.row);
    const i = sameRow.indexOf(it);
    const nearestIn = (row: number) => {
      const list = ordered.filter((o) => o.row === row);
      return list.reduce<Placed | null>((best, o) => (!best || Math.abs(o.x - it.x) < Math.abs(best.x - it.x) ? o : best), null);
    };
    const rowsWithItems = [...new Set(ordered.map((o) => o.row))].sort((a, z) => a - z);
    const ri = rowsWithItems.indexOf(it.row);
    let target: Placed | null | undefined = null;
    switch (e.key) {
      case "ArrowRight":
        target = sameRow[i + 1];
        break;
      case "ArrowLeft":
        target = sameRow[i - 1];
        break;
      case "ArrowUp":
        target = ri > 0 ? nearestIn(rowsWithItems[ri - 1]!) : null;
        break;
      case "ArrowDown":
        target = ri < rowsWithItems.length - 1 ? nearestIn(rowsWithItems[ri + 1]!) : null;
        break;
      case "Home":
        target = ordered[0];
        break;
      case "End":
        target = ordered[ordered.length - 1];
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        onSelect(it.device.id);
        return;
      case "+":
      case "=":
        zoomBy(1.2);
        break;
      case "-":
        zoomBy(1 / 1.2);
        break;
      default:
        return;
    }
    e.preventDefault();
    if (target) focusItem(target.device.id);
  };

  const fault = building.waterFault;
  const faultRow = fault ? lay.rowOfLevel.get(fault.faultLevelId) : undefined;
  const meterRow = fault ? lay.rowOfLevel.get(fault.meterLevelId) : undefined;
  const faultLane = fault ? lay.lanes.find((l) => l.system?.id === fault.systemId) ?? lay.lanes[0] : undefined;
  const mainsLane = lay.lanes.find((l) => l.system?.type === "cold-water") ?? lay.lanes[0];

  // symbols in use, for the legend in the title block
  const inUse = [...new Set(lay.items.map((i) => i.symbol))].map((k) => symbolByKind.get(k)!).sort((a, z) => SYMBOLS.indexOf(a) - SYMBOLS.indexOf(z));

  // The title block sits bottom right of what is visible, as on a drawing sheet.
  const visibleW = Math.min(lay.width, (boxW - pan.x) / scale);
  const titleX = Math.max(LABEL_W + 20, visibleW - 300);
  const titleY = lay.height + 8;

  return (
    <div className={styles.frame}>
      <div className={styles.controls} role="toolbar" aria-label="Drawing view">
        <button type="button" onClick={() => zoomBy(1.2)} aria-label="Zoom in">
          <Plus size={14} strokeWidth={1.5} aria-hidden />
        </button>
        <button type="button" onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom out">
          <Minus size={14} strokeWidth={1.5} aria-hidden />
        </button>
        <button type="button" onClick={resetView} aria-label="Fit the whole drawing">
          <Maximize2 size={14} strokeWidth={1.5} aria-hidden />
        </button>
      </div>
      <div
        ref={box}
        className={styles.viewport}
        style={{ height: Math.min(viewH, Math.max(420, viewH)) }}
        onWheel={(e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
        }}
        onPointerDown={(e) => {
          if ((e.target as Element).closest("[data-device]")) return;
          drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setPan({ x: drag.current.px + (e.clientX - drag.current.x), y: drag.current.py + (e.clientY - drag.current.y) });
        }}
        onPointerUp={() => (drag.current = null)}
      >
        <svg
          width={Math.max(boxW, Math.ceil(lay.width * scale) + 8)}
          height={Math.max(viewH, 200)}
          className={styles.svg}
          role="group"
          aria-label={`Hydraulic riser schematic, ${building.summary.name}. Layer: ${LAYER_LABEL[layer]}. Use the arrow keys to move between devices and Enter to inspect one.`}
        >
          <defs>
            <pattern id={hatch} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" className={styles.hatchLine} />
            </pattern>
          </defs>
          <g transform={`translate(${pan.x},${pan.y}) scale(${scale})`}>
            {/* rows: datum lines, labels, collapsed bands */}
            {lay.rows.map((r, i) => (
              <g key={i} onPointerEnter={() => setHoverRow(i)} onPointerLeave={() => setHoverRow((h) => (h === i ? null : h))}>
                {r.kind === "band" ? (
                  <>
                    <rect x={LABEL_W} y={r.y - r.h / 2 + 4} width={lay.width - LABEL_W} height={r.h - 8} fill={`url(#${hatch})`} className={styles.band} />
                    <text x={LABEL_W + 8} y={r.y + 4} className={styles.bandLabel}>
                      {r.label}
                    </text>
                  </>
                ) : (
                  <>
                    {hoverRow === i && <rect x={0} y={r.y - r.h / 2} width={lay.width} height={r.h} className={styles.rowHover} />}
                    <line x1={LABEL_W - 8} x2={lay.width} y1={r.y + r.h / 2 - 1} y2={r.y + r.h / 2 - 1} className={styles.datum} />
                    <text x={8} y={r.y + 4} className={styles.levelLabel}>
                      {r.label}
                    </text>
                  </>
                )}
              </g>
            ))}

            {/* the zone between the meter that sees the leak and where it is */}
            {fault && faultRow !== undefined && meterRow !== undefined && mainsLane && faultLane && (
              <rect
                x={Math.min(mainsLane.x, faultLane.x) - 10}
                y={lay.rows[Math.min(faultRow, meterRow)]!.y - ROW_HALF}
                width={Math.abs(faultLane.x - mainsLane.x) + faultLane.width + 4}
                height={lay.rows[Math.max(faultRow, meterRow)]!.y - lay.rows[Math.min(faultRow, meterRow)]!.y + 2 * ROW_HALF}
                className={styles.faultZone}
              />
            )}

            {/* pipes: one riser per water system, in jade */}
            {lay.lanes.map((lane) => {
              if (!lane.water) return null;
              const ext = pipeExtent(lay, lane, building);
              if (!ext) return null;
              const top = lay.rows[ext[0]]!.y;
              const bottom = lay.rows[ext[1]]!.y;
              return (
                <g key={lane.key}>
                  <line x1={lane.x} x2={lane.x} y1={top} y2={bottom} className={styles.pipe} />
                  <text x={lane.x + 6} y={TOP_LABEL_Y} className={styles.laneLabel}>
                    {lane.title}
                  </text>
                </g>
              );
            })}
            {/* incoming main into riser A, and the booster's draw from it */}
            {mainsLane && (() => {
              const ext = pipeExtent(lay, mainsLane, building);
              if (!ext) return null;
              const y = lay.rows[ext[1]]!.y;
              const booster = lay.lanes.find((l) => l.system?.type === "booster");
              const bExt = booster ? pipeExtent(lay, booster, building) : null;
              return (
                <g>
                  <line x1={LABEL_W - 4} x2={mainsLane.x} y1={y} y2={y} className={styles.pipe} />
                  <path d={`M${LABEL_W + 2} ${y - 4} l7 4 l-7 4 z`} className={styles.arrow} />
                  {booster && bExt && <line x1={mainsLane.x} x2={booster.x} y1={lay.rows[bExt[1]]!.y} y2={lay.rows[bExt[1]]!.y} className={styles.pipe} />}
                </g>
              );
            })()}
            {/* branches from the riser to each device on it */}
            {lay.items.map((it) => {
              const lane = lay.lanes[it.lane]!;
              if (!lane.water) return null;
              return <line key={`b-${it.device.id}`} x1={lane.x} x2={it.x + 2} y1={it.y} y2={it.y} className={styles.branch} />;
            })}

            {/* the faulty segment, in the alert colour and dashed so it reads in greyscale */}
            {fault && faultRow !== undefined && faultLane && (
              <line
                x1={faultLane.x}
                x2={faultLane.x}
                y1={lay.rows[faultRow]!.y - ROW_HALF}
                y2={lay.rows[faultRow]!.y + ROW_HALF}
                className={fault.severity === "critical" ? styles.faultCritical : styles.faultWarning}
              />
            )}

            {/* devices */}
            {lay.items.map((it, index) => (
              <RiserItem
                key={it.device.id}
                it={it}
                index={index}
                idBase={idBase}
                layer={layer}
                selected={selectedId === it.device.id}
                dimRow={hoverRow !== null && hoverRow !== it.row}
                tabbable={tabbable === it.device.id}
                onSelect={() => onSelect(it.device.id)}
                onKeyDown={(e) => onItemKey(e, it)}
                onFocus={() => setFocusId(it.device.id)}
              />
            ))}

            {/* title block, as on a drawing sheet */}
            <g transform={`translate(${titleX},${titleY})`} className={styles.titleBlock}>
              <rect width={290} height={titleBlockH - 8} className={styles.tbFrame} />
              <line x1={0} x2={290} y1={22} y2={22} className={styles.tbRule} />
              <text x={8} y={15} className={styles.tbTitle}>
                Hydraulic riser schematic
              </text>
              <text x={8} y={38} className={styles.tbText}>
                {building.summary.name}
              </text>
              <text x={8} y={54} className={styles.tbSoft}>
                Layer: {LAYER_LABEL[layer]}. Not to scale.
              </text>
              <text x={8} y={70} className={styles.tbSoft}>
                Live at {formatTimeZoned(now, building.summary.zone, { seconds: true })}
              </text>
              <line x1={0} x2={290} y1={78} y2={78} className={styles.tbRule} />
              {inUse.slice(0, 10).map((s, i) => (
                <g key={s.kind} transform={`translate(${8 + (i % 2) * 142},${84 + Math.floor(i / 2) * 11})`}>
                  <g transform="scale(0.42)" className={styles.tbSymbol}>
                    {s.draw({ level: 0.6 })}
                  </g>
                  <text x={14} y={8} className={styles.tbLegend}>
                    {s.name}
                  </text>
                </g>
              ))}
            </g>
          </g>
        </svg>
      </div>
      <div className="visually-hidden">
        {lay.items.map((it, index) => (
          <span key={it.device.id} id={`${idBase}-${index}-d`}>
            {accessibleDescription(it.device, layer, it.compact)}
          </span>
        ))}
      </div>
    </div>
  );
}

const ROW_HALF = 26;
const TOP_LABEL_Y = 14;

function RiserItem({
  it,
  index,
  idBase,
  layer,
  selected,
  dimRow,
  tabbable,
  onSelect,
  onKeyDown,
  onFocus,
}: {
  it: Placed;
  index: number;
  idBase: string;
  layer: Layer;
  selected: boolean;
  dimRow: boolean;
  tabbable: boolean;
  onSelect: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onFocus: () => void;
}) {
  const d = it.device;
  const v = displayValue(d, layer);
  const st = itemStatus(d);
  const inLayer = layer === "health" || v !== null || st !== null;
  const color = v && MEASURE_COLOR[v.measure] ? MEASURE_COLOR[v.measure] : "var(--ink)";
  const reading = d.readings[0];
  const symbolOpts = {
    wet: d.kind === "leak-sensor" && reading?.value === 1,
    closed: d.kind === "valve-controller" && reading?.value === 1,
    level: d.kind === "tank-level" && reading ? reading.value / 100 : 0.6,
  };
  const spec = symbolByKind.get(it.symbol as SymbolKind)!;
  const top = it.y - 12;
  const uid = `${idBase}-${index}`;
  // the name is the visible text, in order; the rest is the description
  const labelledBy = it.compact ? `${uid}-t` : v ? `${uid}-t ${uid}-v` : `${uid}-t`;
  return (
    <g
      data-device={d.id}
      role="button"
      tabIndex={tabbable ? 0 : -1}
      aria-labelledby={labelledBy}
      aria-describedby={`${uid}-d`}
      aria-pressed={selected}
      className={`${styles.item} ${inLayer ? "" : styles.dim} ${dimRow ? styles.rowDim : ""}`}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
    >
      <rect x={it.x - 4} y={top - 6} width={it.w - 6} height={44} className={selected ? styles.selected : styles.hit} />
      <g transform={`translate(${it.x},${top})`} style={{ color: d.status === "offline" ? "var(--ink-soft)" : color }} className={styles.symbol}>
        <rect width={24} height={24} className={styles.symbolBack} />
        {spec.draw(symbolOpts)}
      </g>
      {st && (
        <g transform={`translate(${it.x + 17},${top - 7})`}>
          <rect x={-1} y={-1} width={14} height={14} className={styles.glyphBack} />
          <StatusGlyph status={st} size={12} />
        </g>
      )}
      {it.compact ? (
        <text id={`${uid}-t`} x={it.x + 12} y={top + 36} textAnchor="middle" className={styles.compactTag}>
          {d.tag}
        </text>
      ) : (
        <>
          <g transform={`translate(${it.x + 30},${top - 2})`}>
            <rect width={d.tag.length * 6.6 + 10} height={15} rx={2} className={styles.tag} />
            <text id={`${uid}-t`} x={5} y={11} className={styles.tagText}>
              {d.tag}
            </text>
          </g>
          {v && (
            <text id={`${uid}-v`} x={it.x + 30} y={top + 28} className={styles.value}>
              {/* the leading space keeps "FT-01 87.9" apart when assistive tech joins the texts; SVG collapses it on screen */}
              {" "}
              {v.text}
              {v.unit && <tspan className={styles.unit}> {v.unit}</tspan>}
            </text>
          )}
        </>
      )}
    </g>
  );
}
