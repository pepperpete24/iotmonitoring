/**
 * The table primitive. 0 radius, hairline rules, 32 px rows (40 comfortable),
 * numbers right-aligned and tabular. Rows are selectable with mouse or
 * keyboard (arrow keys move, Enter selects) and the selection opens in the
 * inspector through `onSelect`.
 */
import { type ReactNode, useRef } from "react";
import styles from "./DataTable.module.css";

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** "num" right-aligns with tabular figures. */
  align?: "start" | "num" | "center";
  width?: number | string;
  render: (row: T) => ReactNode;
  /** Sort accessor; the column header becomes a sort button when present. */
  sortValue?: (row: T) => number | string;
}

export interface SortState {
  key: string;
  dir: "asc" | "desc";
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  /** Visually hide the caption (it stays for screen readers). */
  hideCaption?: boolean;
  selectedKey?: string | null;
  onSelect?: (row: T) => void;
  sort?: SortState;
  onSort?: (s: SortState) => void;
  /** Extra content under a row, for expanded rows. */
  renderExpanded?: (row: T) => ReactNode | null;
  empty?: ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  hideCaption = true,
  selectedKey,
  onSelect,
  sort,
  onSort,
  renderExpanded,
  empty,
}: Props<T>) {
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  const sorted = (() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    const out = [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      return va < vb ? -1 : va > vb ? 1 : 0;
    });
    return sort.dir === "desc" ? out.reverse() : out;
  })();

  const moveFocus = (from: HTMLElement, step: number) => {
    const all = Array.from(bodyRef.current?.querySelectorAll<HTMLTableRowElement>("tr[data-row]") ?? []);
    const i = all.indexOf(from as HTMLTableRowElement);
    all[Math.min(all.length - 1, Math.max(0, i + step))]?.focus();
  };

  return (
    <table className={styles.table}>
      <caption className={hideCaption ? "visually-hidden" : styles.caption}>{caption}</caption>
      <colgroup>
        {columns.map((c) => (
          <col key={c.key} style={c.width !== undefined ? { width: c.width } : undefined} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {columns.map((c) => {
            const active = sort?.key === c.key;
            const ariaSort = active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined;
            return (
              <th key={c.key} scope="col" className={styles[c.align ?? "start"]} aria-sort={ariaSort}>
                {c.sortValue && onSort ? (
                  <button
                    type="button"
                    className={styles.sortButton}
                    onClick={() => onSort({ key: c.key, dir: active && sort!.dir === "asc" ? "desc" : "asc" })}
                  >
                    {c.header}
                    <span aria-hidden className={styles.sortMark}>
                      {active ? (sort!.dir === "asc" ? "↑" : "↓") : ""}
                    </span>
                  </button>
                ) : (
                  c.header
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody ref={bodyRef}>
        {sorted.length === 0 && (
          <tr>
            <td colSpan={columns.length} className={styles.empty}>
              {empty ?? "Nothing to show."}
            </td>
          </tr>
        )}
        {sorted.map((row) => {
          const key = rowKey(row);
          const selected = key === selectedKey;
          const expanded = renderExpanded?.(row);
          return [
            <tr
              key={key}
              data-row
              tabIndex={onSelect ? 0 : undefined}
              aria-selected={onSelect ? selected : undefined}
              className={`${styles.row} ${onSelect ? styles.selectable : ""}`}
              onClick={onSelect ? () => onSelect(row) : undefined}
              onKeyDown={
                onSelect
                  ? (e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(row);
                      } else if (e.key === "ArrowDown") {
                        e.preventDefault();
                        moveFocus(e.currentTarget, 1);
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        moveFocus(e.currentTarget, -1);
                      }
                    }
                  : undefined
              }
            >
              {columns.map((c) => (
                <td key={c.key} className={styles[c.align ?? "start"]}>
                  {c.render(row)}
                </td>
              ))}
            </tr>,
            expanded ? (
              <tr key={`${key}-x`} className={styles.expanded}>
                <td colSpan={columns.length}>{expanded}</td>
              </tr>
            ) : null,
          ];
        })}
      </tbody>
    </table>
  );
}
