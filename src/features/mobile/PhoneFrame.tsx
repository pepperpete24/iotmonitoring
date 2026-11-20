/**
 * Phone views run without the desktop shell: a slim header with the time,
 * then the job. The demo tray stays available for the founder.
 */
import type { ReactNode } from "react";
import { Wordmark } from "@/shell/Wordmark";
import { DemoTray } from "@/shell/DemoTray";
import { formatTimeZoned } from "@/lib/format";
import { useSimNow } from "@/state/clock";
import styles from "./Phone.module.css";

export function PhoneFrame({ children, zone = "Australia/Sydney" }: { children: ReactNode; zone?: string }) {
  const now = useSimNow();
  return (
    <div className={styles.screen}>
      <div className={styles.phone}>
        <header className={styles.header}>
          <Wordmark />
          <time className={styles.time}>{formatTimeZoned(now, zone)}</time>
        </header>
        <main className={styles.main}>{children}</main>
      </div>
      <DemoTray />
    </div>
  );
}
