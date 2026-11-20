/**
 * Schematic symbols for the riser diagram and device lists. 24 px grid,
 * 1.5 px stroke, drawn in currentColor so they sit in ink by default. Water
 * inside a symbol (tank contents, a wet leak sensor) is drawn in jade.
 *
 * Each symbol renders as a <g> so the riser diagram can place it in its own
 * SVG; <SchematicSymbol> wraps one in a standalone <svg>.
 */
import type { ReactNode } from "react";

export type SymbolKind =
  | "gate-valve"
  | "isolation-valve"
  | "check-valve"
  | "prv"
  | "pump"
  | "booster-set"
  | "tank"
  | "flow-meter"
  | "pressure-sensor"
  | "temperature-probe"
  | "leak-sensor"
  | "pump-monitor"
  | "door-contact"
  | "gateway"
  | "hot-water-unit"
  | "cool-room"
  | "flow-arrow"
  | "riser-break"
  | "level-datum"
  | "tee";

export interface SymbolOptions {
  /** Tank contents, 0 to 1. */
  level?: number;
  /** Leak sensor reads wet. */
  wet?: boolean;
  /** Valve is closed (drawn filled). */
  closed?: boolean;
}

export interface SymbolSpec {
  kind: SymbolKind;
  name: string;
  /** What it stands for, in a hydraulic contractor's words. */
  description: string;
  group: "Valves" | "Pumps and storage" | "Instruments" | "Devices" | "Equipment" | "Drawing";
  draw: (o: SymbolOptions) => ReactNode;
}

const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinejoin: "round", strokeLinecap: "round" } as const;
const solid = { fill: "currentColor", stroke: "currentColor", strokeWidth: 1.5, strokeLinejoin: "round" } as const;
const water = { fill: "var(--jade)", stroke: "none" } as const;

/** Bow-tie valve body centred on (12, 14). */
const bowtie = (closed?: boolean) => (
  <path d="M4 9.5v9l8-4.5zM20 9.5v9l-8-4.5z" {...(closed ? solid : S)} />
);

export const SYMBOLS: readonly SymbolSpec[] = [
  {
    kind: "gate-valve",
    name: "Gate valve",
    description: "Manual isolation valve on a pipe run.",
    group: "Valves",
    draw: ({ closed }) => <g>{bowtie(closed)}</g>,
  },
  {
    kind: "isolation-valve",
    name: "Isolation valve, actuated",
    description: "Motorised shut-off valve with a controller. Filled when closed.",
    group: "Valves",
    draw: ({ closed }) => (
      <g>
        {bowtie(closed)}
        <path d="M12 14V7" {...S} />
        <rect x="8" y="3" width="8" height="4" {...S} />
      </g>
    ),
  },
  {
    kind: "check-valve",
    name: "Non-return valve",
    description: "Lets water pass one way only.",
    group: "Valves",
    draw: () => (
      <g>
        <path d="M4 9.5v9l8-4.5z" {...S} />
        <path d="M20 9.5v9l-8-4.5z" {...solid} />
      </g>
    ),
  },
  {
    kind: "prv",
    name: "Pressure-reducing valve",
    description: "Steps pressure down between zones.",
    group: "Valves",
    draw: () => (
      <g>
        {bowtie()}
        <path d="M12 14V8" {...S} />
        <path d="M7.5 8a4.5 4.5 0 0 1 9 0z" {...S} />
      </g>
    ),
  },
  {
    kind: "pump",
    name: "Pump",
    description: "Centrifugal pump. Outlet at the top.",
    group: "Pumps and storage",
    draw: () => (
      <g>
        <circle cx="12" cy="13" r="7" {...S} />
        <path d="M12 6h8" {...S} />
        <path d="M9.5 10l5 3-5 3z" {...solid} />
      </g>
    ),
  },
  {
    kind: "booster-set",
    name: "Booster set",
    description: "Duty and standby pumps on a common header.",
    group: "Pumps and storage",
    draw: () => (
      <g>
        <path d="M3 6h18" {...S} />
        <path d="M7 6v3M17 6v3" {...S} />
        <circle cx="7" cy="14" r="4.5" {...S} />
        <circle cx="17" cy="14" r="4.5" {...S} />
      </g>
    ),
  },
  {
    kind: "tank",
    name: "Tank",
    description: "Storage tank. Contents drawn to the current level.",
    group: "Pumps and storage",
    draw: ({ level }) => {
      const l = Math.min(1, Math.max(0, level ?? 0.6));
      const h = 14 * l;
      return (
        <g>
          {l > 0 && <rect x="5" y={19 - h} width="14" height={h} {...water} />}
          <rect x="4.25" y="4.25" width="15.5" height="15.5" {...S} />
        </g>
      );
    },
  },
  {
    kind: "flow-meter",
    name: "Flow meter",
    description: "Measures flow in L/min and volume in kL.",
    group: "Instruments",
    draw: () => (
      <g>
        <circle cx="12" cy="12" r="7.5" {...S} />
        <path d="M7.5 12h8" {...S} />
        <path d="M13 9l3 3-3 3" {...S} />
      </g>
    ),
  },
  {
    kind: "pressure-sensor",
    name: "Pressure sensor",
    description: "Measures pressure in kPa.",
    group: "Instruments",
    draw: () => (
      <g>
        <circle cx="12" cy="12" r="7.5" {...S} />
        <path d="M12 12l4-4" {...S} />
        <circle cx="12" cy="12" r="1.2" {...solid} />
        <path d="M7 15.5h10" {...S} />
      </g>
    ),
  },
  {
    kind: "temperature-probe",
    name: "Temperature probe",
    description: "Measures temperature in °C.",
    group: "Instruments",
    draw: () => (
      <g>
        <path d="M10 14.5V5a2 2 0 0 1 4 0v9.5" {...S} />
        <circle cx="12" cy="17" r="3.5" {...S} />
        <path d="M12 9v8" {...S} />
      </g>
    ),
  },
  {
    kind: "leak-sensor",
    name: "Leak sensor",
    description: "Floor sensor that reads wet or dry. Water drawn when wet.",
    group: "Instruments",
    draw: ({ wet }) => (
      <g>
        <path d="M12 3.5c2.8 3.6 4.6 6 4.6 8.4a4.6 4.6 0 0 1-9.2 0c0-2.4 1.8-4.8 4.6-8.4z" {...(wet ? { ...S, fill: "var(--jade)" } : S)} />
        <path d="M4 20.25h16" {...S} />
      </g>
    ),
  },
  {
    kind: "pump-monitor",
    name: "Pump current monitor",
    description: "Clamp on the pump supply. Reads current in A and duty in %.",
    group: "Instruments",
    draw: () => (
      <g>
        <path d="M3 12h18" {...S} />
        <path d="M14.5 6.5a6 6 0 1 0 0 11" {...S} />
      </g>
    ),
  },
  {
    kind: "door-contact",
    name: "Door contact",
    description: "Reads open or closed, for cool rooms and plant rooms.",
    group: "Instruments",
    draw: () => (
      <g>
        <rect x="4.25" y="7.25" width="6" height="9.5" {...S} />
        <rect x="13.75" y="7.25" width="6" height="9.5" {...S} />
      </g>
    ),
  },
  {
    kind: "gateway",
    name: "Gateway",
    description: "LoRaWAN or cellular gateway that relays device uplinks.",
    group: "Devices",
    draw: () => (
      <g>
        <path d="M12 11v9.25M8 20.25h8" {...S} />
        <circle cx="12" cy="10" r="1.3" {...solid} />
        <path d="M8.6 6.6a4.8 4.8 0 0 1 6.8 0M6.2 4.2a8.2 8.2 0 0 1 11.6 0" {...S} />
      </g>
    ),
  },
  {
    kind: "hot-water-unit",
    name: "Hot water unit",
    description: "Storage hot water heater on the hot water flow and return.",
    group: "Equipment",
    draw: () => (
      <g>
        <path d="M6.75 6.5a5.25 2.25 0 0 1 10.5 0v11a5.25 2.25 0 0 1-10.5 0z" {...S} />
        <path d="M9 15.5l1.5-2 1.5 2 1.5-2 1.5 2" {...S} />
      </g>
    ),
  },
  {
    kind: "cool-room",
    name: "Cool room",
    description: "Refrigerated room. Limit set by the customer.",
    group: "Equipment",
    draw: () => (
      <g>
        <rect x="4.25" y="4.25" width="15.5" height="15.5" {...S} />
        <path d="M12 8v8M8.5 10l7 4M8.5 14l7-4" {...S} />
      </g>
    ),
  },
  {
    kind: "flow-arrow",
    name: "Flow direction",
    description: "Direction of flow in a pipe.",
    group: "Drawing",
    draw: () => (
      <g>
        <path d="M3 12h10" {...S} />
        <path d="M13 8l7 4-7 4z" {...solid} />
      </g>
    ),
  },
  {
    kind: "riser-break",
    name: "Riser break",
    description: "Riser continues through levels that are not drawn.",
    group: "Drawing",
    draw: () => (
      <g>
        <path d="M12 2v7.5M12 14.5V22" {...S} />
        <path d="M7 11l10-2M7 15l10-2" {...S} />
      </g>
    ),
  },
  {
    kind: "level-datum",
    name: "Level datum",
    description: "Marks a level's finished floor height.",
    group: "Drawing",
    draw: () => (
      <g>
        <path d="M2 16.25h20" {...S} />
        <path d="M8.5 10h7L12 16.25z" {...S} />
      </g>
    ),
  },
  {
    kind: "tee",
    name: "Tee",
    description: "A branch off a riser or main.",
    group: "Drawing",
    draw: () => (
      <g>
        <path d="M2 12h20M12 12v10" {...S} />
      </g>
    ),
  },
];

export const symbolByKind = new Map(SYMBOLS.map((s) => [s.kind, s]));

/** One symbol as a standalone SVG. */
export function SchematicSymbol({
  kind,
  size = 24,
  label,
  className,
  ...opts
}: SymbolOptions & { kind: SymbolKind; size?: number; label?: string; className?: string }) {
  const spec = symbolByKind.get(kind);
  if (!spec) return null;
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...a11y} style={{ flex: "none" }}>
      {spec.draw(opts)}
    </svg>
  );
}
