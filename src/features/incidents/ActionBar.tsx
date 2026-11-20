/**
 * Every action on an incident. Forms open in place below the bar (never a
 * modal). The button names the action; the confirmation repeats the verb.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useCommand } from "@/api/queries";
import type { IncidentDetail } from "@/api/types";
import { Button } from "@/components/Button";
import type { Command } from "@/mock/engine/engine";
import { useUi } from "@/state/ui";
import styles from "./ActionBar.module.css";

type Panel = null | "assign" | "dispatch" | "valve" | "false-alarm" | "resolve" | "escalate";

const PEOPLE = [
  { id: "marcus", name: "Marcus Teo", role: "Building manager, Kendall Street Tower" },
  { id: "tom", name: "Tom Fitzgerald", role: "Duty plumber, Calloway Plumbing & Drainage" },
  { id: "helen", name: "Helen Castellano", role: "Head of Property Operations" },
  { id: "ben", name: "Ben Kowalczyk", role: "Portfolio manager, NSW" },
  { id: "liam", name: "Liam Hartigan", role: "Portfolio manager, VIC and TAS" },
  { id: "grace", name: "Grace Okonkwo", role: "Portfolio manager, QLD" },
  { id: "ruth", name: "Ruth Adeyemi", role: "Portfolio manager, SA and WA" },
  { id: "priya", name: "Priya Venkataraman", role: "Building manager, 140 Wexford Street" },
  { id: "daniel", name: "Daniel Aboud", role: "Facilities coordinator, Ellery House Hotel" },
  { id: "sandra", name: "Sandra Lindqvist", role: "Kitchen manager, Wattle Grove Aged Care" },
];

const CAUSES = [
  "Mechanical seal failure on pump P-02",
  "Flexible hose burst",
  "Isolation valve gland leaking",
  "Toilet cistern running",
  "Rain ingress",
  "Condensate overflow",
  "Door left open",
  "Equipment fault",
];

export function ActionBar({ i }: { i: IncidentDetail }) {
  const by = useUi((s) => s.role);
  const cmd = useCommand();
  const [panel, setPanel] = useState<Panel>(null);
  const [done, setDone] = useState<string | null>(null);
  const resolved = i.state === "resolved";

  const run = (c: Command, confirmation: string) => {
    setDone(null);
    cmd.mutate(c, {
      onSuccess: () => {
        setDone(confirmation);
        setPanel(null);
      },
    });
  };
  const error = cmd.isError ? (cmd.error as Error).message : null;

  if (resolved) {
    return (
      <div className={styles.bar}>
        <p className={styles.closed}>
          {i.resolution === "false-alarm" ? "Closed as false alarm" : "Resolved"} by {i.resolvedBy}. Cause: {i.cause}. Action: {i.action}.
        </p>
        <Link className={styles.linkButton} to={`/reports/incident/${i.id}`}>
          Export incident report
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.bar} role="toolbar" aria-label={`Actions on ${i.id}`}>
        {i.state === "open" && (
          <Button variant="primary" onClick={() => run({ type: "acknowledge", incidentId: i.id, by }, "Acknowledged. Escalation stopped.")} disabled={cmd.isPending}>
            Acknowledge
          </Button>
        )}
        <Button onClick={() => setPanel(panel === "assign" ? null : "assign")} aria-expanded={panel === "assign"}>
          Assign
        </Button>
        <Button onClick={() => setPanel(panel === "dispatch" ? null : "dispatch")} aria-expanded={panel === "dispatch"}>
          Dispatch
        </Button>
        {i.state === "open" && i.severity === "critical" && (
          <Button onClick={() => setPanel(panel === "escalate" ? null : "escalate")} aria-expanded={panel === "escalate"}>
            Escalate now
          </Button>
        )}
        {i.valve && !i.valve.closed && (
          <Button onClick={() => setPanel(panel === "valve" ? null : "valve")} aria-expanded={panel === "valve"}>
            Close isolation valve
          </Button>
        )}
        <Button variant="quiet" onClick={() => setPanel(panel === "false-alarm" ? null : "false-alarm")} aria-expanded={panel === "false-alarm"}>
          Mark false alarm
        </Button>
        <Button variant="quiet" onClick={() => setPanel(panel === "resolve" ? null : "resolve")} aria-expanded={panel === "resolve"}>
          Resolve
        </Button>
        <Link className={styles.linkButton} to={`/reports/incident/${i.id}`}>
          Export incident report
        </Link>
      </div>

      {done && (
        <p className={styles.done} role="status">
          {done}
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {panel === "assign" && <AssignForm i={i} onSubmit={(to) => run({ type: "assign", incidentId: i.id, to, by }, `Assigned to ${PEOPLE.find((p) => p.id === to)?.name}.`)} onCancel={() => setPanel(null)} />}
      {panel === "dispatch" && (
        <DispatchForm
          i={i}
          onSubmit={(to, etaMin) => run({ type: "dispatch", incidentId: i.id, to, etaMin, by }, `Dispatched ${PEOPLE.find((p) => p.id === to)?.name}, ETA ${etaMin} min.`)}
          onCancel={() => setPanel(null)}
        />
      )}
      {panel === "escalate" && (
        <div className={styles.panel}>
          <p>Send the next escalation step now instead of waiting. The person and channels follow the roster.</p>
          <div className={styles.row}>
            <Button variant="primary" onClick={() => run({ type: "escalate-now", incidentId: i.id, by }, "Escalated. The next person on the roster has been sent the alert.")}>
              Escalate now
            </Button>
            <Button variant="quiet" onClick={() => setPanel(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {panel === "valve" && i.valve && (
        <div className={styles.panel}>
          <p>
            <strong>Closing {i.valve.tag} cuts water.</strong> {i.valve.isolation} This is written to the Logbook, and pressure and pump alerts on the isolated system are muted until it reopens.
          </p>
          <div className={styles.row}>
            <Button variant="primary" onClick={() => run({ type: "close-valve", buildingId: i.buildingId, valveTag: i.valve!.tag, incidentId: i.id, by }, `Closed ${i.valve!.tag}.`)}>
              Close {i.valve.tag}
            </Button>
            <Button variant="quiet" onClick={() => setPanel(null)}>
              Keep it open
            </Button>
          </div>
        </div>
      )}
      {panel === "false-alarm" && (
        <CauseForm
          title="Mark false alarm"
          explain="Closes the incident and records why nothing was wrong. It still counts in reports, as a false alarm."
          causeLabel="What set it off"
          causes={["Floor mopped near the sensor", "Cleaner's bucket", "Sensor knocked during works"]}
          withAction={false}
          submit="Mark false alarm"
          onSubmit={(cause) => run({ type: "false-alarm", incidentId: i.id, cause, by }, "Marked as false alarm. Incident closed.")}
          onCancel={() => setPanel(null)}
        />
      )}
      {panel === "resolve" && (
        <CauseForm
          title="Resolve"
          explain={i.wetSensors.length ? `${i.wetSensors.join(", ")} still reads wet. You can record the cause now; resolving waits until it reads dry.` : "Record what caused it and what was done. Both appear in reports."}
          causeLabel="Cause"
          causes={CAUSES}
          withAction
          submit="Resolve"
          onSubmit={(cause, action) => run({ type: "resolve", incidentId: i.id, cause, action: action ?? "", by }, `Resolved. ${i.id} is closed.`)}
          onCancel={() => setPanel(null)}
        />
      )}
    </div>
  );
}

function AssignForm({ i, onSubmit, onCancel }: { i: IncidentDetail; onSubmit: (to: string) => void; onCancel: () => void }) {
  const [to, setTo] = useState(PEOPLE[0]!.id);
  return (
    <form className={styles.panel} onSubmit={(e) => (e.preventDefault(), onSubmit(to))}>
      <label className={styles.field}>
        <span>Assign {i.id} to</span>
        <select value={to} onChange={(e) => setTo(e.target.value)}>
          {PEOPLE.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}, {p.role}
            </option>
          ))}
        </select>
      </label>
      <div className={styles.row}>
        <Button type="submit" variant="primary">
          Assign
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function DispatchForm({ i, onSubmit, onCancel }: { i: IncidentDetail; onSubmit: (to: string, eta: number) => void; onCancel: () => void }) {
  const [to, setTo] = useState("tom");
  const [eta, setEta] = useState("25");
  return (
    <form className={styles.panel} onSubmit={(e) => (e.preventDefault(), onSubmit(to, Math.max(1, Number(eta) || 25)))}>
      <p>Sends the responder a link to {i.id} with directions to {i.location.toLowerCase().startsWith("level") ? i.location : `the ${i.location}`}.</p>
      <div className={styles.row}>
        <label className={styles.field}>
          <span>Responder</span>
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            {PEOPLE.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}, {p.role}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>ETA in minutes</span>
          <input type="number" min={1} max={240} value={eta} onChange={(e) => setEta(e.target.value)} className={styles.short} />
        </label>
      </div>
      <div className={styles.row}>
        <Button type="submit" variant="primary">
          Dispatch
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function CauseForm(props: {
  title: string;
  explain: string;
  causeLabel: string;
  causes: string[];
  withAction: boolean;
  submit: string;
  onSubmit: (cause: string, action?: string) => void;
  onCancel: () => void;
}) {
  const [cause, setCause] = useState("");
  const [action, setAction] = useState("");
  const listId = `causes-${props.title.replace(/\s/g, "")}`;
  return (
    <form className={styles.panel} onSubmit={(e) => (e.preventDefault(), props.onSubmit(cause.trim(), action.trim()))}>
      <p>{props.explain}</p>
      <label className={styles.field}>
        <span>{props.causeLabel} (required)</span>
        <input list={listId} value={cause} onChange={(e) => setCause(e.target.value)} required className={styles.wide} />
        <datalist id={listId}>
          {props.causes.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      {props.withAction && (
        <label className={styles.field}>
          <span>Action taken (required)</span>
          <textarea value={action} onChange={(e) => setAction(e.target.value)} required rows={3} className={styles.wide} placeholder="For example: seal replaced by Calloway Plumbing, pump back in service" />
        </label>
      )}
      <div className={styles.row}>
        <Button type="submit" variant="primary">
          {props.submit}
        </Button>
        <Button variant="quiet" onClick={props.onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
