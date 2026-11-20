/**
 * A reading: tabular number, then its unit smaller and lighter. When the
 * value changes it highlights for 600 ms (instant under reduced motion).
 */
import { useEffect, useRef, useState } from "react";
import { type Unit, unitDecimals, valueParts } from "@/lib/format";
import styles from "./Value.module.css";

interface Props {
  value: number | null | undefined;
  unit: Unit;
  decimals?: number;
  /** Shown when there is no value, for example while a device is offline. */
  missing?: string;
  flash?: boolean;
  size?: "table" | "figure";
}

export function Value({ value, unit, decimals = unitDecimals[unit], missing = "No reading", flash = true, size = "table" }: Props) {
  const [tick, setTick] = useState(0);
  const prev = useRef(value);
  useEffect(() => {
    if (flash && prev.current !== undefined && prev.current !== value) setTick((t) => t + 1);
    prev.current = value;
  }, [value, flash]);

  if (value === null || value === undefined || Number.isNaN(value)) {
    return <span className={styles.missing}>{missing}</span>;
  }
  const p = valueParts(value, unit, decimals);
  return (
    <span key={tick} className={`${styles.value} ${styles[size]} ${tick ? "flash" : ""}`}>
      <span className={styles.num}>{p.value}</span>
      <span className={styles.unit}>{p.unit}</span>
    </span>
  );
}
