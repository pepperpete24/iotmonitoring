/** Below 768 px the riser becomes a list ordered by level, with the same symbols. */
import type { BuildingDetail } from "@/api/types";
import { SchematicSymbol } from "@/components/symbols/symbols";
import { StatusGlyph } from "@/components/status/StatusGlyph";
import { Tag } from "@/components/Tag";
import { displayValue, itemStatus } from "./RiserDiagram";
import type { Layer } from "./riserLayout";
import { symbolFor } from "./riserLayout";
import styles from "./RiserList.module.css";

export function RiserList({ building, layer, selectedId, onSelect }: { building: BuildingDetail; layer: Layer; selectedId: string | null; onSelect: (id: string) => void }) {
  const levels = [...building.levels].sort((a, z) => z.order - a.order).filter((l) => building.devices.some((d) => d.levelId === l.id));
  return (
    <ol className={styles.list} aria-label={`Devices by level, ${building.summary.name}`}>
      {levels.map((l) => (
        <li key={l.id}>
          <h3 className={styles.level}>{l.label}</h3>
          <ul>
            {building.devices
              .filter((d) => d.levelId === l.id)
              .map((d) => {
                const v = displayValue(d, layer);
                const st = itemStatus(d);
                const r = d.readings[0];
                return (
                  <li key={d.id}>
                    <button type="button" className={styles.item} aria-pressed={selectedId === d.id} onClick={() => onSelect(d.id)}>
                      <SchematicSymbol kind={symbolFor(d)} size={24} wet={d.kind === "leak-sensor" && r?.value === 1} closed={d.kind === "valve-controller" && r?.value === 1} level={d.kind === "tank-level" && r ? r.value / 100 : 0.6} />
                      <Tag>{d.tag}</Tag>
                      <span className={styles.where}>{d.location}</span>
                      <span className={styles.value}>
                        {st && <StatusGlyph status={st} size={12} />}
                        {v ? `${v.text}${v.unit ? ` ${v.unit}` : ""}` : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
        </li>
      ))}
    </ol>
  );
}
