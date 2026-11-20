/** A tiny section through a building: levels as hairlines, the affected level marked. */
import type { LevelView } from "@/api/types";
import type { Status } from "@/domain/common";
import styles from "./MiniRiser.module.css";

export function MiniRiser({ levels, markLevelId, status, label }: { levels: LevelView[]; markLevelId: string | null; status: Status | null; label: string }) {
  const sorted = [...levels].sort((a, z) => z.order - a.order);
  const h = Math.max(36, Math.min(96, sorted.length * 4 + 8));
  const step = (h - 8) / Math.max(1, sorted.length - 1);
  const ground = sorted.findIndex((l) => l.short === "G");
  return (
    <svg width={44} height={h} viewBox={`0 0 44 ${h}`} role="img" aria-label={label} className={styles.glyph}>
      <line x1={14} x2={14} y1={4} y2={h - 4} className={styles.riser} />
      {sorted.map((l, i) => {
        const y = 4 + i * step;
        const marked = l.id === markLevelId;
        return (
          <g key={l.id}>
            <line x1={6} x2={marked ? 30 : 22} y1={y} y2={y} className={marked ? styles.marked : i === ground ? styles.ground : styles.level} />
            {marked && status && (status === "critical" ? <path d={`M34 ${y - 4} l4 4 l-4 4 l-4 -4 z`} className={styles.crit} /> : <path d={`M34 ${y - 4} l4 7 h-8 z`} className={styles.warn} />)}
          </g>
        );
      })}
    </svg>
  );
}
