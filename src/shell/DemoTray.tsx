/**
 * Demo controls for the founder, opened with Shift+D. M1 holds the clock,
 * theme and density; scenario triggers and role switching join in M2 and M7.
 */
import { useEffect } from "react";
import { X } from "lucide-react";
import { Button, Segmented } from "@/components/Button";
import { type Speed, useClockStore } from "@/state/clock";
import { type Density, type ThemePref, useUi } from "@/state/ui";
import styles from "./DemoTray.module.css";

export function DemoTray() {
  const open = useUi((s) => s.trayOpen);
  const setOpen = useUi((s) => s.setTrayOpen);
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  const density = useUi((s) => s.density);
  const setDensity = useUi((s) => s.setDensity);
  const speed = useClockStore((s) => s.speed);
  const setSpeed = useClockStore((s) => s.setSpeed);
  const reset = useClockStore((s) => s.reset);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.shiftKey && (e.key === "D" || e.key === "d")) {
        e.preventDefault();
        setOpen(!useUi.getState().trayOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  if (!open) {
    return (
      <button type="button" className={styles.handle} onClick={() => setOpen(true)} aria-keyshortcuts="Shift+D">
        Demo tray
        <kbd>Shift D</kbd>
      </button>
    );
  }

  return (
    <section className={styles.tray} aria-label="Demo tray">
      <header className={styles.head}>
        <h2 className="t-section">Demo tray</h2>
        <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close demo tray">
          <X size={16} strokeWidth={1.5} aria-hidden />
        </button>
      </header>
      <div className={styles.row}>
        <span className={styles.label}>Clock</span>
        <Segmented<`${Speed}`>
          label="Clock speed"
          value={`${speed}`}
          options={[
            { value: "1", label: "1x" },
            { value: "10", label: "10x" },
            { value: "60", label: "60x" },
          ]}
          onChange={(v) => setSpeed(Number(v) as Speed)}
        />
        <Button variant="quiet" onClick={reset}>
          Reset to 07:48
        </Button>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Theme</span>
        <Segmented<ThemePref>
          label="Theme"
          value={theme}
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Night" },
            { value: "system", label: "System" },
          ]}
          onChange={setTheme}
        />
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Density</span>
        <Segmented<Density>
          label="Density"
          value={density}
          options={[
            { value: "compact", label: "Compact" },
            { value: "comfortable", label: "Comfortable" },
          ]}
          onChange={setDensity}
        />
      </div>
    </section>
  );
}
