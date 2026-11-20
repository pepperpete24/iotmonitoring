/**
 * Status is a shape first. Critical: filled diamond. Warning: triangle with an
 * ink stroke. Offline: open circle with hatch. Muted: open circle with a bar.
 * Acknowledged and resolved have no glyph; they are words.
 */
import { useId } from "react";
import { type Status, STATUS_LABEL } from "@/domain/common";
import styles from "./StatusGlyph.module.css";

interface Props {
  status: Status;
  size?: 10 | 12 | 14 | 16;
  /** Glyph drawn on a status fill (annunciator window): uses the on-colour. */
  onFill?: boolean;
  /** Accessible name. Omit when a visible word sits beside the glyph. */
  title?: string;
  className?: string;
}

export function StatusGlyph({ status, size = 12, onFill, title, className }: Props) {
  const hatchId = useId();
  const a11y = title ? { role: "img", "aria-label": title } : { "aria-hidden": true };
  const cls = [styles.glyph, styles[status], onFill && styles.onFill, className].filter(Boolean).join(" ");
  return (
    <svg className={cls} width={size} height={size} viewBox="0 0 12 12" {...a11y}>
      {status === "critical" && <path className={styles.critFill} d="M6 0.6 11.4 6 6 11.4 0.6 6Z" />}
      {status === "warning" && (
        <path className={styles.warnFill} d="M6 1.1 11.3 10.6H0.7Z" strokeWidth={1} strokeLinejoin="round" />
      )}
      {status === "offline" && (
        <>
          <defs>
            <pattern id={hatchId} width="2.5" height="2.5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="2.5" className={styles.hatchLine} strokeWidth="1" />
            </pattern>
          </defs>
          <circle cx="6" cy="6" r="4.6" fill={`url(#${CSS.escape(hatchId)})`} className={styles.ring} strokeWidth="1.5" />
        </>
      )}
      {status === "muted" && (
        <>
          <circle cx="6" cy="6" r="4.6" fill="none" className={styles.ring} strokeWidth="1.5" />
          <line x1="3.2" y1="6" x2="8.8" y2="6" className={styles.ring} strokeWidth="1.5" />
        </>
      )}
    </svg>
  );
}

/** Glyph plus its word. The standard way to show status in text. */
export function StatusLabel({ status, children, size = 12 }: { status: Status; children?: React.ReactNode; size?: 12 | 14 }) {
  return (
    <span className={styles.label}>
      <StatusGlyph status={status} size={size} />
      <span>{children ?? STATUS_LABEL[status]}</span>
    </span>
  );
}
