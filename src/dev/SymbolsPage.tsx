/** /dev/symbols: the symbol legend. Internal only. */
import { SchematicSymbol, SYMBOLS, type SymbolSpec } from "@/components/symbols/symbols";
import { StatusGlyph } from "@/components/status/StatusGlyph";
import { STATUS_LABEL, type Status } from "@/domain/common";
import { useInspect } from "@/shell/url";
import styles from "./dev.module.css";

const GROUPS: SymbolSpec["group"][] = ["Valves", "Pumps and storage", "Instruments", "Devices", "Equipment", "Drawing"];
const STATUSES: Array<[Status, string]> = [
  ["critical", "Filled diamond. Critical alerts only."],
  ["warning", "Triangle with an ink outline. Warnings only."],
  ["offline", "Open circle, hatched. Device not reporting."],
  ["muted", "Open circle with a bar. Alerts paused for maintenance."],
];

export function SymbolsPage() {
  const { open, target } = useInspect();
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className="t-title">Symbols</h1>
        <p className="t-body t-prose soft">
          Schematic symbols for the riser diagram. 24 px grid, 1.5 px stroke, drawn in ink. Water inside a symbol is
          jade. Select a symbol to inspect it.
        </p>
      </header>

      {GROUPS.map((g) => (
        <section key={g} className={styles.section}>
          <h2 className="t-section">{g}</h2>
          <ul className={styles.symbolGrid}>
            {SYMBOLS.filter((s) => s.group === g).map((s) => (
              <li key={s.kind}>
                <button
                  type="button"
                  className={styles.symbolCell}
                  aria-pressed={target?.type === "symbol" && target.id === s.kind}
                  onClick={() => open("symbol", s.kind)}
                >
                  <span className={styles.symbolArt}>
                    <SchematicSymbol kind={s.kind} size={48} level={0.62} />
                    <SchematicSymbol kind={s.kind} size={24} level={0.62} />
                  </span>
                  <span className={styles.symbolName}>{s.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className={styles.section}>
        <h2 className="t-section">States drawn on symbols</h2>
        <ul className={styles.symbolGrid}>
          <li className={styles.symbolCell}>
            <span className={styles.symbolArt}>
              <SchematicSymbol kind="leak-sensor" size={48} wet />
            </span>
            <span className={styles.symbolName}>Leak sensor, wet</span>
          </li>
          <li className={styles.symbolCell}>
            <span className={styles.symbolArt}>
              <SchematicSymbol kind="isolation-valve" size={48} closed />
            </span>
            <span className={styles.symbolName}>Isolation valve, closed</span>
          </li>
          <li className={styles.symbolCell}>
            <span className={styles.symbolArt}>
              <SchematicSymbol kind="tank" size={48} level={0.31} />
            </span>
            <span className={styles.symbolName}>Tank at 31%</span>
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className="t-section">Status glyphs</h2>
        <table className={styles.legend}>
          <tbody>
            {STATUSES.map(([s, text]) => (
              <tr key={s}>
                <td>
                  <StatusGlyph status={s} size={16} />
                </td>
                <td>{STATUS_LABEL[s]}</td>
                <td className="soft">{text}</td>
              </tr>
            ))}
            <tr>
              <td />
              <td>Acknowledged, resolved</td>
              <td className="soft">Words only, no glyph and no colour.</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
