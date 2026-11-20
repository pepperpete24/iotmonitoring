/**
 * Layout for the riser drawing, computed from a building's topology:
 * rows for levels (runs of levels without devices collapse into one band),
 * lanes for systems, and a position for every device.
 */
import type { BuildingDetail, DeviceLive, LevelView, SystemView } from "@/api/types";
import type { SymbolKind } from "@/components/symbols/symbols";

export const LABEL_W = 96;
export const ROW_H = 64;
export const BAND_H = 30;
export const VALUE_W = 118;
/** A lane wraps a crowded level onto another line beyond this width. */
export const LINE_CAP = 2 * VALUE_W + 46;
export const LINE_H = 48;
export const COMPACT_W = 46;
export const LANE_PAD = 28;
export const TOP_PAD = 24;

export type Layer = "flow" | "pressure" | "temperature" | "health";

export const LAYER_LABEL: Record<Layer, string> = {
  flow: "Flow and tanks",
  pressure: "Pressure",
  temperature: "Temperature",
  health: "Device health",
};

const WATER_TYPES = new Set(["cold-water", "booster", "hot-water", "fire-tank", "rainwater"]);

export interface Row {
  kind: "level" | "band";
  levels: LevelView[];
  y: number; // centre line
  h: number;
  label: string;
}

export interface Lane {
  key: string;
  system: SystemView | null;
  title: string;
  x: number; // pipe x
  width: number;
  water: boolean;
}

export interface Placed {
  device: DeviceLive;
  x: number; // symbol left
  y: number; // row centre
  w: number;
  compact: boolean;
  symbol: SymbolKind;
  row: number;
  lane: number;
}

export interface RiserLayout {
  rows: Row[];
  lanes: Lane[];
  items: Placed[];
  width: number;
  height: number;
  rowOfLevel: Map<string, number>;
}

export function symbolFor(d: DeviceLive): SymbolKind {
  switch (d.kind) {
    case "flow-meter":
      return "flow-meter";
    case "pressure-sensor":
      return "pressure-sensor";
    case "tank-level":
      return "tank";
    case "pump-monitor":
      return "pump";
    case "leak-sensor":
      return "leak-sensor";
    case "temperature-probe":
      return d.location.toLowerCase().includes("cool room") ? "cool-room" : d.systemId?.endsWith("/hw") ? "hot-water-unit" : "temperature-probe";
    case "door-contact":
      return "door-contact";
    case "valve-controller":
      return "isolation-valve";
    default:
      return "gateway";
  }
}

const isCompact = (d: DeviceLive) => d.kind === "leak-sensor" || d.kind === "door-contact";

export function layoutRiser(b: BuildingDetail): RiserLayout {
  const levels = [...b.levels].sort((a, z) => z.order - a.order); // top first
  const used = new Set(b.devices.map((d) => d.levelId));

  // rows: keep levels with devices; collapse runs without (heights and y are set below)
  const rows: Row[] = [];
  let run: LevelView[] = [];
  const flush = () => {
    if (!run.length) return;
    const first = run[run.length - 1]!; // lowest
    const last = run[0]!; // highest
    const label =
      run.length === 1 ? `${first.label}, no devices` : `${shortLabel(first)} to ${shortLabel(last).replace(/^Level /, "")}, no devices`;
    rows.push({ kind: "band", levels: run, y: 0, h: BAND_H, label });
    run = [];
  };
  for (const l of levels) {
    if (used.has(l.id)) {
      flush();
      rows.push({ kind: "level", levels: [l], y: 0, h: ROW_H, label: l.label });
    } else run.push(l);
  }
  flush();
  const rowOfLevel = new Map<string, number>();
  rows.forEach((r, i) => r.levels.forEach((l) => rowOfLevel.set(l.id, i)));

  // lanes: water systems first by lane number, then loose leak sensors, refrigeration, gateways
  const sys = [...b.systems].sort((a, z) => a.lane - z.lane);
  const laneDefs: Array<{ key: string; system: SystemView | null; title: string; water: boolean; match: (d: DeviceLive) => boolean }> = [];
  for (const s of sys.filter((s) => WATER_TYPES.has(s.type))) {
    laneDefs.push({ key: s.id, system: s, title: s.name, water: true, match: (d) => d.systemId === s.id && d.kind !== "gateway" });
  }
  laneDefs.push({ key: "loose", system: null, title: "Pits, floors and rooms", water: false, match: (d) => d.systemId === null && d.kind !== "gateway" });
  for (const s of sys.filter((s) => s.type === "refrigeration")) {
    laneDefs.push({ key: s.id, system: s, title: s.name, water: false, match: (d) => d.systemId === s.id });
  }
  laneDefs.push({ key: "net", system: sys.find((s) => s.type === "network") ?? null, title: "Gateways", water: false, match: (d) => d.kind === "gateway" });

  // Pass 1: per lane, place items on lines within each row, wrapping when a row is crowded.
  const pending: Array<{ d: DeviceLive; lane: number; row: number; dx: number; line: number; w: number }> = [];
  const lanes: Lane[] = [];
  const linesInRow = new Map<number, number>();
  let x = LABEL_W + 20;
  laneDefs.forEach((def) => {
    const devs = b.devices.filter(def.match);
    if (!devs.length && !def.water) return;
    const perRow = new Map<number, DeviceLive[]>();
    for (const d of devs) {
      const r = rowOfLevel.get(d.levelId);
      if (r === undefined) continue;
      perRow.set(r, [...(perRow.get(r) ?? []), d]);
    }
    const laneIndex = lanes.length;
    const indent = def.water ? 18 : 6;
    let widest = 0;
    for (const [r, list] of perRow) {
      // value items first, compact ones after, in a stable order
      list.sort((a, z) => Number(isCompact(a)) - Number(isCompact(z)) || a.tag.localeCompare(z.tag));
      let dx = 0;
      let line = 0;
      for (const d of list) {
        const w = isCompact(d) ? COMPACT_W : VALUE_W;
        if (dx > 0 && dx + w > LINE_CAP) {
          line++;
          dx = 0;
        }
        pending.push({ d, lane: laneIndex, row: r, dx: indent + dx, line, w });
        dx += w;
        widest = Math.max(widest, dx);
      }
      linesInRow.set(r, Math.max(linesInRow.get(r) ?? 1, line + 1));
    }
    const width = Math.max(def.water ? 120 : 80, widest + indent + LANE_PAD - 6);
    lanes.push({ key: def.key, system: def.system, title: def.title, x, width, water: def.water });
    x += width;
  });

  // Pass 2: row heights grow with wrapped lines; then every row gets its centre line.
  let y = TOP_PAD;
  rows.forEach((r, i) => {
    if (r.kind === "level") r.h = ROW_H + ((linesInRow.get(i) ?? 1) - 1) * LINE_H;
    r.y = y + (r.kind === "level" ? ROW_H / 2 : r.h / 2);
    y += r.h;
  });

  const items: Placed[] = pending.map((p) => ({
    device: p.d,
    x: lanes[p.lane]!.x + p.dx,
    y: rows[p.row]!.y + p.line * LINE_H,
    w: p.w,
    compact: isCompact(p.d),
    symbol: symbolFor(p.d),
    row: p.row,
    lane: p.lane,
  }));

  return { rows, lanes, items, width: x + 16, height: y + 12, rowOfLevel };
}

function shortLabel(l: LevelView): string {
  return l.label;
}

/** Vertical extent of a water lane's pipe, as row indices (top, bottom). */
export function pipeExtent(lay: RiserLayout, lane: Lane, b: BuildingDetail): [number, number] | null {
  if (!lane.system) return null;
  const s = lane.system;
  const rowsOf = [s.servesFrom, s.servesTo, ...b.devices.filter((d) => d.systemId === s.id).map((d) => d.levelId), ...b.equipment.filter((e) => e.systemId === s.id).map((e) => e.levelId)]
    .map((id) => lay.rowOfLevel.get(id))
    .filter((r): r is number => r !== undefined);
  if (!rowsOf.length) return null;
  return [Math.min(...rowsOf), Math.max(...rowsOf)];
}
