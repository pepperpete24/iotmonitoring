import { brand } from "@/brand";
import styles from "./Wordmark.module.css";

/** The mark: a wall section with the line water leaves on it. */
export function Wordmark() {
  return (
    <span className={styles.wordmark}>
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
        <rect x="0.75" y="0.75" width="18.5" height="18.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 12.5c2.3-1.6 4.7 1.6 7 0s4.7 1.6 7 0" fill="none" stroke="var(--jade)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span>{brand.name}</span>
    </span>
  );
}
