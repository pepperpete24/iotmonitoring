/**
 * /m/respond/:incidentId, opened from an SMS link. The responder should
 * understand the alert, acknowledge and know where to go within 10 seconds.
 */
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useBuilding, useCommand, useIncident } from "@/api/queries";
import { Button } from "@/components/Button";
import { StatusGlyph } from "@/components/status/StatusGlyph";
import { formatDuration, formatNumber, formatTimeZoned } from "@/lib/format";
import { useSimNow } from "@/state/clock";
import { useUi } from "@/state/ui";
import { PhoneFrame } from "./PhoneFrame";
import styles from "./Phone.module.css";

export function RespondPage() {
  const { incidentId } = useParams();
  const { data: i, isPending, isError } = useIncident(incidentId);
  const { data: b } = useBuilding(i?.buildingId);
  const now = useSimNow();
  const role = useUi((s) => s.role);
  const by = role === "helen" ? "tom" : role; // the SMS link is the responder's
  const cmd = useCommand();
  const [done, setDone] = useState<string | null>(null);
  const [panel, setPanel] = useState<null | "note" | "photo" | "resolve">(null);
  const [text, setText] = useState("");
  const [action, setAction] = useState("");

  if (isPending) return <PhoneFrame><p className={styles.place}>Opening the alert</p></PhoneFrame>;
  if (isError || !i) {
    return (
      <PhoneFrame>
        <p className={styles.headline}>This link has expired</p>
        <p className={styles.place}>The alert may have been resolved already. Call the building manager if you are on your way.</p>
      </PhoneFrame>
    );
  }
  const run = (c: Parameters<typeof cmd.mutate>[0], msg: string) =>
    cmd.mutate(c, {
      onSuccess: () => {
        setDone(msg);
        setPanel(null);
        setText("");
        setAction("");
      },
    });
  // one live value: the meter that measured it, or the alerting device
  // a wet floor sensor says more on site than the building's total flow
  const wetAlert = i.alerts.find((a) => i.wetSensors.includes(a.deviceTag));
  const deviceId = wetAlert?.deviceId ?? (i.leak ? `${i.buildingId}/${i.leak.meterTag}` : i.alerts[i.alerts.length - 1]?.deviceId);
  const dev = b?.devices.find((d) => d.id === deviceId);
  const reading = dev?.readings.find((r) => r.measure !== "current");
  const wetNow = i.wetSensors.length > 0;
  const resolved = i.state === "resolved";
  const mine = i.dispatchedTo && i.state === "dispatched";
  return (
    <PhoneFrame zone={i.zone}>
      <p className={styles.sev}>
        <StatusGlyph status={i.severity} size={16} />
        {i.severity === "critical" ? "Critical" : "Warning"}, {i.title.toLowerCase()}
      </p>
      <h1 className={styles.headline}>{i.buildingName}</h1>
      <p className={styles.place}>
        <strong>{i.location}</strong>
        {i.levelLabel && !i.location.startsWith(i.levelLabel) ? `, ${i.levelLabel}` : ""}. {resolved ? "Resolved." : `${i.severity === "critical" ? "Critical" : "Open"} for ${formatDuration(now - i.severitySince)}.`}
      </p>
      <p className={styles.access}>{i.access}</p>
      {reading && dev && (
        <div className={styles.live}>
          <span className="t-small">
            {dev.tag}, {dev.kindLabel.toLowerCase()}, {dev.location.toLowerCase().startsWith(i.location.toLowerCase()) ? "" : `${dev.location}, `}at {formatTimeZoned(reading.at, i.zone)}
          </span>
          <span className={styles.liveValue}>
            {reading.measure === "wet" ? (reading.value ? "Wet" : "Dry") : `${formatNumber(reading.value, reading.measure === "pressure" || reading.measure === "level" ? 0 : 1)} ${reading.unit}`}
          </span>
          {i.leak && i.leak.to === null && <span>About {formatNumber(i.leak.rateLpm, 1)} L/min more than usual is running.</span>}
          {wetNow && !wetAlert && <span>{i.wetSensors.join(", ")} reads wet.</span>}
        </div>
      )}

      {done && (
        <p className={styles.done} role="status">
          {done}
        </p>
      )}
      {cmd.isError && (
        <p className={styles.error} role="alert">
          {(cmd.error as Error).message}
        </p>
      )}

      {resolved ? (
        <p className={styles.state}>Resolved by {i.resolvedBy}. Nothing more to do.</p>
      ) : (
        <div className={styles.stack}>
          {i.state === "open" ? (
            <Button variant="primary" size="large" className={styles.big} onClick={() => run({ type: "acknowledge", incidentId: i.id, by }, "Acknowledged. The others have been told you have it.")}>
              Acknowledge
            </Button>
          ) : (
            <p className={styles.state}>
              {mine ? `On the way: ${i.dispatchedTo}` : `Acknowledged by ${i.acknowledgedBy}`}
            </p>
          )}
          {!mine && (
            <Button size="large" className={styles.big} onClick={() => run({ type: "on-my-way", incidentId: i.id, etaMin: 20, by }, "On your way. The building manager has been told: ETA 20 min.")}>
              I am on my way
            </Button>
          )}
          {i.siteContact && (
            <Button
              size="large"
              className={styles.big}
              onClick={() => run({ type: "note", incidentId: i.id, text: `Called ${i.siteContact!.name} from the responder view.`, by }, `Calling ${i.siteContact!.name}, ${i.siteContact!.mobileMasked}. The call is noted on the incident.`)}
            >
              Call building manager
            </Button>
          )}
          {i.state === "open" && (
            <Button variant="quiet" size="large" className={styles.big} onClick={() => run({ type: "cannot-attend", incidentId: i.id, by }, "Noted. The next person on the roster has been sent the alert.")}>
              Cannot attend
            </Button>
          )}
        </div>
      )}

      {!resolved && (
        <section className={styles.section} aria-label="Report back">
          <div className={styles.stack}>
            <Button className={styles.big} onClick={() => setPanel(panel === "note" ? null : "note")} aria-expanded={panel === "note"}>
              Add a note
            </Button>
            <Button className={styles.big} onClick={() => setPanel(panel === "photo" ? null : "photo")} aria-expanded={panel === "photo"}>
              Add a photo
            </Button>
            <Button className={styles.big} onClick={() => setPanel(panel === "resolve" ? null : "resolve")} aria-expanded={panel === "resolve"}>
              Resolve
            </Button>
          </div>
          {panel === "note" && (
            <form className={styles.stack} onSubmit={(e) => (e.preventDefault(), run({ type: "note", incidentId: i.id, text, by }, "Note added."))}>
              <label className={styles.field}>
                <span>What you found or did</span>
                <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} required />
              </label>
              <Button type="submit" variant="primary" size="large" className={styles.big}>
                Add note
              </Button>
            </form>
          )}
          {panel === "photo" && (
            <form className={styles.stack} onSubmit={(e) => (e.preventDefault(), run({ type: "photo", incidentId: i.id, caption: text, by }, "Photo added."))}>
              <div className={styles.camera}>The camera is not connected in this demo. Describe the photo below.</div>
              <label className={styles.field}>
                <span>Caption</span>
                <input value={text} onChange={(e) => setText(e.target.value)} required placeholder="For example: seal leaking at pump P-02" />
              </label>
              <Button type="submit" variant="primary" size="large" className={styles.big}>
                Add photo
              </Button>
            </form>
          )}
          {panel === "resolve" && (
            <form className={styles.stack} onSubmit={(e) => (e.preventDefault(), run({ type: "resolve", incidentId: i.id, cause: text, action, by }, "Resolved. Thank you."))}>
              {wetNow && <p className={styles.error}>{i.wetSensors.join(", ")} still reads wet. Dry the floor around it; resolving works once it reads dry.</p>}
              <label className={styles.field}>
                <span>Cause</span>
                <input value={text} onChange={(e) => setText(e.target.value)} required />
              </label>
              <label className={styles.field}>
                <span>What you did</span>
                <textarea rows={3} value={action} onChange={(e) => setAction(e.target.value)} required />
              </label>
              <Button type="submit" variant="primary" size="large" className={styles.big}>
                Resolve
              </Button>
            </form>
          )}
        </section>
      )}
      <p className="t-small">
        {i.id}. Raised {formatTimeZoned(i.openedAt, i.zone)}.
      </p>
    </PhoneFrame>
  );
}
