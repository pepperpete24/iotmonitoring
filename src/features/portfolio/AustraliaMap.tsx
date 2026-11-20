/**
 * A secondary view: buildings on a plain vector outline of Australia.
 * No map tiles. Healthy buildings are ink dots; abnormal ones carry their glyph.
 */
import type { BuildingSummary } from "@/api/types";
import { StatusGlyph } from "@/components/status/StatusGlyph";
import { STATUS_LABEL } from "@/domain/common";
import styles from "./AustraliaMap.module.css";

// Simplified coastline, longitude and latitude.
const MAINLAND: Array<[number, number]> = [
  [142.5, -10.7], [143.5, -14.0], [145.3, -14.9], [145.9, -17.0], [146.3, -19.0], [148.8, -20.3], [150.0, -22.0], [151.0, -23.5],
  [153.0, -25.2], [153.6, -28.2], [153.2, -30.0], [152.5, -32.5], [151.3, -33.8], [150.8, -35.0], [150.0, -37.5], [148.0, -37.8],
  [146.3, -39.1], [144.9, -37.9], [143.5, -38.8], [141.0, -38.3], [139.7, -37.2], [139.0, -35.8], [138.4, -35.6], [138.5, -34.6],
  [137.8, -35.3], [137.5, -34.0], [137.9, -33.0], [136.0, -34.8], [135.2, -33.9], [134.0, -32.5], [131.0, -31.5], [128.9, -31.7],
  [126.0, -32.3], [123.5, -33.9], [121.0, -33.8], [118.0, -35.0], [115.0, -34.3], [115.7, -32.6], [115.0, -30.0], [114.0, -27.0],
  [113.4, -26.0], [113.7, -23.0], [114.2, -21.8], [116.8, -20.6], [119.0, -20.0], [121.0, -19.5], [122.2, -18.0], [123.5, -17.0],
  [125.0, -15.0], [127.0, -14.0], [128.5, -15.0], [129.5, -14.9], [130.0, -13.0], [131.0, -12.2], [132.5, -11.5], [134.0, -12.0],
  [136.0, -12.2], [136.8, -13.0], [135.9, -15.0], [137.5, -16.2], [139.5, -17.5], [140.8, -17.4], [141.6, -15.0], [141.5, -12.5],
];
const TASMANIA: Array<[number, number]> = [
  [144.6, -40.7], [146.5, -41.1], [148.3, -40.9], [148.3, -42.2], [147.8, -43.2], [146.9, -43.6], [145.9, -43.4], [145.2, -42.2],
];

const W = 760;
const H = 520;
const LON = [112, 163];
const LAT = [-44.5, -9.5];
const px = (lon: number) => ((lon - LON[0]!) / (LON[1]! - LON[0]!)) * W;
const py = (lat: number) => ((LAT[1]! - lat) / (LAT[1]! - LAT[0]!)) * H;
const path = (pts: Array<[number, number]>) => `M${pts.map(([lo, la]) => `${px(lo).toFixed(1)},${py(la).toFixed(1)}`).join("L")}Z`;

export function AustraliaMap({ buildings, onSelect, selectedId }: { buildings: BuildingSummary[]; onSelect: (id: string) => void; selectedId: string | null }) {
  // Buildings in the same city sit on top of each other: fan the marks out and stack their labels.
  const clusters: Array<{ x: number; y: number; members: BuildingSummary[] }> = [];
  for (const b of buildings) {
    const x = px(b.lon);
    const y = py(b.lat);
    const c = clusters.find((k) => Math.hypot(k.x - x, k.y - y) < 26);
    if (c) c.members.push(b);
    else clusters.push({ x, y, members: [b] });
  }
  const placed: Array<{ b: BuildingSummary; x: number; y: number; lx: number; ly: number }> = [];
  for (const c of clusters) {
    const abnormal = c.members.filter((m) => m.status !== "normal");
    c.members.forEach((b, i) => {
      const angle = (i / Math.max(1, c.members.length)) * Math.PI * 2;
      const r = c.members.length > 1 ? 9 : 0;
      const k = abnormal.indexOf(b);
      placed.push({ b, x: c.x + Math.cos(angle) * r, y: c.y + Math.sin(angle) * r, lx: c.x + 18, ly: c.y + 4 + (k - (abnormal.length - 1) / 2) * 15 });
    });
  }
  return (
    <figure className={styles.figure}>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} role="group" aria-label="Buildings on a map of Australia">
        <path d={path(MAINLAND)} className={styles.land} />
        <path d={path(TASMANIA)} className={styles.land} />
        {placed.map(({ b, x, y, lx, ly }) => (
          <g key={b.id}>
          {b.status !== "normal" && (
            <text x={lx} y={ly} className={styles.label}>
              {b.shortName}
            </text>
          )}
          <g
            transform={`translate(${x},${y})`}
            role="button"
            tabIndex={0}
            aria-label={`${b.name}, ${b.suburb} ${b.state}${b.status !== "normal" ? `, ${STATUS_LABEL[b.status].toLowerCase()}` : ""}`}
            aria-pressed={selectedId === b.id}
            className={styles.pin}
            onClick={() => onSelect(b.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(b.id);
              }
            }}
          >
            <circle r={12} className={styles.hit} />
            {b.status === "normal" ? <circle r={3.5} className={styles.dot} /> : <g transform="translate(-7,-7)"><StatusGlyph status={b.status} size={14} /></g>}
          </g>
          </g>
        ))}
      </svg>
      <figcaption className="t-small">Positions are approximate. Abnormal buildings are named; select any building to inspect it.</figcaption>
    </figure>
  );
}
