/** On screen: a toolbar and A4 sheets on a concrete ground. In print: just the pages. */
import type { ReactNode } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/Button";
import styles from "./Report.module.css";

export function ReportFrame({ toolbar, children, title }: { toolbar?: ReactNode; children: ReactNode; title: string }) {
  return (
    <div className={styles.frame}>
      <div className={`${styles.toolbar} no-print`} role="toolbar" aria-label="Report">
        <h1 className={styles.toolbarTitle}>{title}</h1>
        {toolbar}
        <Button variant="primary" onClick={() => window.print()}>
          <Printer size={16} strokeWidth={1.5} aria-hidden /> Print or save as PDF
        </Button>
      </div>
      <p className={`${styles.hint} no-print`}>Use your browser's print dialogue and choose "Save as PDF" to send it. Pages are A4, portrait.</p>
      <div className={styles.document}>{children}</div>
    </div>
  );
}

/** One A4 sheet. A sheet after the first starts on a new printed page. */
export function Sheet({ children, footer }: { children: ReactNode; footer: string }) {
  return (
    <article className={styles.sheet}>
      <div className={styles.sheetBody}>{children}</div>
      <footer className={styles.sheetFooter}>{footer}</footer>
    </article>
  );
}
