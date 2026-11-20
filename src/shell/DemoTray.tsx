/**
 * Demo controls for the founder, opened with Shift+D: the clock, scenarios,
 * who you are, the SMS a responder received, theme and density.
 */
import { useEffect } from "react";
import { X } from "lucide-react";
import { Button, Segmented } from "@/components/Button";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useCommand, usePortfolioStatus, useSms } from "@/api/queries";
import type { Role } from "@/domain/common";
import { formatTimeZoned } from "@/lib/format";
import { resetDemo } from "@/mock/runtime";
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
  const qc = useQueryClient();
  const command = useCommand();
  const reset = () => {
    resetDemo();
    void qc.invalidateQueries();
  };
  const role = useUi((s) => s.role);
  const dayOne = useUi((s) => s.dayOne);
  const setDayOne = useUi((s) => s.setDayOne);
  const setRole = useUi((s) => s.setRole);
  const navigate = useNavigate();
  const smsFor = role === "marcus" ? "marcus" : "tom";
  const sms = useSms(open ? smsFor : null);
  const portfolio = usePortfolioStatus();
  const latest = sms.data?.[0];
  const switchRole = (r: Role) => {
    setRole(r);
    if (r === "helen") navigate("/portfolio");
    if (r === "marcus") navigate("/buildings/kendall-street-tower");
    const fromSms = latest?.incidentId && latest.incidentId !== "TEST" ? latest.incidentId : null;
    const target = fromSms ?? portfolio.data?.briefing.critical[0]?.incidentId ?? null;
    if (r === "tom") navigate(target ? `/m/respond/${target}` : "/m/commission");
    if (r === "kayla") navigate("/m/commission");
  };
  const trigger = (scenario: "burst" | "door" | "gateway" | "leak-false-alarm") => command.mutate({ type: "trigger", scenario, by: "helen" });

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
      <div className={styles.block}>
        <span className={styles.label}>Scenarios</span>
        <ul className={styles.scenarios}>
          <li>
            <Button onClick={() => trigger("burst")}>Burst main, 140 Wexford Street Level 9</Button>
          </li>
          <li>
            <Button onClick={() => trigger("door")}>Cool room door left open, Wattle Grove</Button>
          </li>
          <li>
            <Button onClick={() => trigger("gateway")}>Gateway GW-04 offline, Ellery House Hotel</Button>
          </li>
          <li>
            <Button onClick={() => trigger("leak-false-alarm")}>Leak sensor wet then dry, Lorne Road</Button>
          </li>
        </ul>
        {command.isError && <p className={styles.error}>{String((command.error as Error).message)}</p>}
      </div>
      <div className={styles.row}>
        <span className={styles.label}>You are</span>
        <Segmented<Role>
          label="Role"
          value={role}
          onChange={switchRole}
          options={[
            { value: "helen", label: "Helen" },
            { value: "marcus", label: "Marcus" },
            { value: "tom", label: "Tom, phone" },
            { value: "kayla", label: "Kayla, phone" },
          ]}
        />
      </div>
      <div className={styles.block}>
        <span className={styles.label}>Latest SMS to {smsFor === "tom" ? "Tom Fitzgerald" : "Marcus Teo"}</span>
        {latest ? (
          <>
            <p className={styles.sms}>
              {latest.body}
              <br />
              <span className={styles.smsMeta}>
                {formatTimeZoned(latest.at, "Australia/Sydney")}. {latest.detail}.
              </span>
            </p>
            {latest.incidentId !== "TEST" && (
              <Button variant="quiet" onClick={() => switchRole(smsFor === "tom" ? "tom" : "marcus")}>
                Open the link as {smsFor === "tom" ? "Tom" : "Marcus"}
              </Button>
            )}
          </>
        ) : (
          <p className={styles.smsMeta}>No SMS sent yet in this demo.</p>
        )}
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Customer</span>
        <Segmented<"pemberton" | "day-one">
          label="Customer"
          value={dayOne ? "day-one" : "pemberton"}
          onChange={(v) => {
            setDayOne(v === "day-one");
            void qc.invalidateQueries();
            navigate("/portfolio");
          }}
          options={[
            { value: "pemberton", label: "Pemberton Hall" },
            { value: "day-one", label: "Day one, new customer" },
          ]}
        />
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
