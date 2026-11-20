/** /settings/*: run the account. */
import { useEffect, useState } from "react";
import { NavLink, useParams, useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { type PersonRow, useCommand, usePeople, useSettings } from "@/api/queries";
import { Button } from "@/components/Button";
import { StatusGlyph } from "@/components/status/StatusGlyph";
import { formatAUD, formatDateTime, formatNumber } from "@/lib/format";
import { useUi } from "@/state/ui";
import { brand } from "@/brand";
import styles from "./SettingsPage.module.css";

const SECTIONS = [
  { key: "escalation", label: "Escalation" },
  { key: "rules", label: "Rules" },
  { key: "people", label: "People and roles" },
  { key: "integrations", label: "Integrations" },
  { key: "plan", label: "Plan and billing" },
] as const;

export function SettingsPage() {
  const { section = "escalation" } = useParams();
  return (
    <div className={styles.page}>
      <h1 className="t-title">Settings</h1>
      <nav className={styles.subnav} aria-label="Settings">
        {SECTIONS.map((s) => (
          <NavLink key={s.key} to={`/settings/${s.key}`} className={({ isActive }) => `${styles.subLink} ${isActive ? styles.active : ""}`}>
            {s.label}
          </NavLink>
        ))}
      </nav>
      {section === "escalation" && <EscalationSettings />}
      {section === "rules" && <RulesSettings />}
      {section === "people" && <PeopleSettings />}
      {section === "integrations" && <IntegrationsSettings />}
      {section === "plan" && <PlanSettings />}
      {!SECTIONS.some((s) => s.key === section) && <p className="soft">No settings page here. Choose a section above.</p>}
    </div>
  );
}

function Feedback({ error, done }: { error: unknown; done: string | null }) {
  if (error) return <p className={styles.error} role="alert">{(error as Error).message}</p>;
  if (done) return <p className={styles.done} role="status">{done}</p>;
  return null;
}

// ---- Escalation ---------------------------------------------------------------------

type Step = { personId: string; channels: Array<"sms" | "push" | "email">; waitMin: number };

function EscalationSettings() {
  const { data } = useSettings();
  const people = usePeople();
  const by = useUi((s) => s.role);
  const cmd = useCommand();
  const [params, setParams] = useSearchParams();
  const buildingId = params.get("building") ?? "kendall-street-tower";
  const current = data?.escalation.find((e) => e.buildingId === buildingId);
  const [steps, setSteps] = useState<Step[]>([]);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    if (current) setSteps(current.steps.map((s) => ({ personId: s.personId, channels: [...s.channels], waitMin: s.waitMin })));
  }, [current?.buildingId, current?.edited]); // eslint-disable-line react-hooks/exhaustive-deps
  // a contact stays listed this session once flagged, so the fix and its test can be seen through
  const [seen, setSeen] = useState<string[]>([]);
  const failing = (people.data ?? []).filter((p) => p.mobileFaulty || (p.sms.recent > 0 && p.sms.lastResult === "failed"));
  useEffect(() => {
    const ids = failing.map((p) => p.id).filter((id) => !seen.includes(id));
    if (ids.length) setSeen((x) => [...x, ...ids]);
  }, [failing.map((p) => p.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const flagged = (people.data ?? []).filter((p) => seen.includes(p.id) || failing.includes(p));
  if (!data || !current) return <p className="soft">Loading escalation settings</p>;
  const dirty = JSON.stringify(steps) !== JSON.stringify(current.steps.map((s) => ({ personId: s.personId, channels: s.channels, waitMin: s.waitMin })));
  const move = (k: number, d: number) => setSteps((s) => {
    const n = [...s];
    const [x] = n.splice(k, 1);
    n.splice(k + d, 0, x!);
    return n;
  });
  return (
    <div className={styles.stack}>
      <section className={styles.section} aria-labelledby="health-h">
        <h2 id="health-h" className="t-section">Contact delivery health</h2>
        {flagged.length ? (
          flagged.map((p) => <ContactFix key={p.id} p={p} />)
        ) : (
          <p className="soft">Every contact's recent SMS delivered. A failing number appears here as soon as two SMS in a row fail.</p>
        )}
      </section>

      <section className={styles.section} aria-labelledby="esc-h">
        <div className={styles.row}>
          <h2 id="esc-h" className="t-section">Critical alerts</h2>
          <label className={styles.field}>
            <span>Building</span>
            <select value={buildingId} onChange={(e) => setParams({ building: e.target.value })}>
              {data.escalation.map((e) => (
                <option key={e.buildingId} value={e.buildingId}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="t-prose soft">
          These people are called in order until someone acknowledges. The chain repeats every {current.repeatEveryMin} minutes.
        </p>
        <ol className={styles.steps}>
          {steps.map((s, k) => (
            <li key={k} className={styles.step}>
              <span className={styles.stepNo}>{k + 1}</span>
              <label className={styles.field}>
                <span>Who</span>
                <select value={s.personId} onChange={(e) => setSteps((x) => x.map((y, j) => (j === k ? { ...y, personId: e.target.value } : y)))}>
                  {(people.data ?? []).filter((p) => p.mobileMasked).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}, {p.title}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className={styles.channels}>
                <legend>Channels</legend>
                {(["sms", "push", "email"] as const).map((c) => (
                  <label key={c}>
                    <input
                      type="checkbox"
                      checked={s.channels.includes(c)}
                      onChange={(e) => setSteps((x) => x.map((y, j) => (j === k ? { ...y, channels: e.target.checked ? [...y.channels, c] : y.channels.filter((z) => z !== c) } : y)))}
                    />{" "}
                    {c === "sms" ? "SMS" : c === "push" ? "Push" : "Email"}
                  </label>
                ))}
              </fieldset>
              <label className={styles.field}>
                <span>Then wait</span>
                <select value={s.waitMin} onChange={(e) => setSteps((x) => x.map((y, j) => (j === k ? { ...y, waitMin: Number(e.target.value) } : y)))}>
                  {[5, 10, 15, 20, 30].map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </select>
              </label>
              <span className={styles.stepTools}>
                <button type="button" aria-label={`Move step ${k + 1} up`} disabled={k === 0} onClick={() => move(k, -1)}>
                  <ArrowUp size={16} strokeWidth={1.5} aria-hidden />
                </button>
                <button type="button" aria-label={`Move step ${k + 1} down`} disabled={k === steps.length - 1} onClick={() => move(k, 1)}>
                  <ArrowDown size={16} strokeWidth={1.5} aria-hidden />
                </button>
                <button type="button" aria-label={`Remove step ${k + 1}`} disabled={steps.length === 1} onClick={() => setSteps((x) => x.filter((_, j) => j !== k))}>
                  <Trash2 size={16} strokeWidth={1.5} aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ol>
        <div className={styles.row}>
          <Button onClick={() => setSteps((x) => [...x, { personId: "helen", channels: ["sms", "email"], waitMin: 10 }])}>Add a step</Button>
          <Button
            variant="primary"
            disabled={!dirty}
            onClick={() => cmd.mutate({ type: "set-escalation", buildingId, steps, by }, { onSuccess: () => setDone(`Saved. Critical alerts at ${current.name} now follow these ${steps.length} steps.`) })}
          >
            Save escalation
          </Button>
        </div>
        <Feedback error={cmd.error} done={done} />
      </section>

      <section className={styles.section} aria-labelledby="quiet-h">
        <h2 id="quiet-h" className="t-section">Quiet hours</h2>
        <ul className={styles.plain}>
          <li>Warnings are sent by email and push at any hour, and by SMS only between 06:00 and 22:00 local time.</li>
          <li>Critical alerts are always sent, except SMS to a person inside their own quiet hours. Their email still goes, and the next step is not delayed.</li>
          {(people.data ?? []).filter((p) => p.quietHours).map((p) => (
            <li key={p.id}>
              {p.name}: no SMS from {p.quietHours!.from} to {p.quietHours!.to}.
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ContactFix({ p }: { p: PersonRow }) {
  const by = useUi((s) => s.role);
  const cmd = useCommand();
  const test = useCommand();
  const [number, setNumber] = useState("");
  const [done, setDone] = useState<string | null>(null);
  if (!p.mobileFaulty) {
    const delivered = p.sms.lastResult === "delivered";
    return (
      <div className={styles.contact}>
        <p>
          <strong>{p.name}</strong>: mobile updated to {p.mobileMasked}. {delivered ? "The test SMS delivered. Alerts will reach this number." : "Send a test to confirm it works."}
        </p>
        {!delivered && (
          <div className={styles.row}>
            <Button variant="primary" onClick={() => test.mutate({ type: "test-message", personId: p.id, by })}>
              Send test message
            </Button>
          </div>
        )}
        <Feedback error={test.error} done={delivered ? `Test SMS to ${p.name} delivered.` : null} />
      </div>
    );
  }
  const ok = /^04\d{2} ?\d{3} ?\d{3}$/.test(number.trim());
  const masked = ok ? `${number.replace(/\s/g, "").slice(0, 4)} ••• ${number.replace(/\s/g, "").slice(-3)}` : "";
  return (
    <div className={styles.contact}>
      <p>
        <StatusGlyph status="warning" size={12} /> <strong>{p.name}</strong>, {p.title}. SMS failed {p.sms.recentFailed} of the last {p.sms.recent}
        {p.sms.lastAt ? `, most recently ${formatDateTime(p.sms.lastAt, "Australia/Sydney", { year: false })}` : ""}. The number on file, {p.mobileMasked}, is not in service.
      </p>
      <form
        className={styles.row}
        onSubmit={(e) => {
          e.preventDefault();
          cmd.mutate({ type: "update-contact", personId: p.id, mobileMasked: masked, by }, { onSuccess: () => setDone(`Updated. ${p.name}'s mobile is now ${masked}. Send a test to confirm it works.`) });
        }}
      >
        <label className={styles.field}>
          <span>New mobile number</span>
          <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="04xx xxx xxx" inputMode="tel" />
        </label>
        <Button type="submit" variant="primary" disabled={!ok}>
          Update number
        </Button>
      </form>
      <Feedback error={cmd.error} done={done} />
    </div>
  );
}

/** Once a number is fixed, it leaves the flagged list; this lets the admin confirm with a test. */
function TestMessages() {
  const people = usePeople();
  const by = useUi((s) => s.role);
  const cmd = useCommand();
  const [done, setDone] = useState<string | null>(null);
  const [who, setWho] = useState("marcus");
  const p = people.data?.find((x) => x.id === who);
  return (
    <section className={styles.section} aria-labelledby="test-h">
      <h2 id="test-h" className="t-section">Send a test message</h2>
      <div className={styles.row}>
        <label className={styles.field}>
          <span>To</span>
          <select value={who} onChange={(e) => setWho(e.target.value)}>
            {(people.data ?? []).filter((x) => x.mobileMasked).map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}, {x.mobileMasked}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={() => cmd.mutate({ type: "test-message", personId: who, by }, { onSuccess: () => setDone(`Test SMS sent to ${p?.name}.`) })}>Send test SMS</Button>
      </div>
      {p && p.sms.lastResult && done && (
        <p className={styles.done} role="status">
          {done} Result: {p.sms.lastResult === "failed" ? "failed, number not in service" : p.sms.lastResult}.
        </p>
      )}
      <Feedback error={cmd.error} done={null} />
    </section>
  );
}

export { TestMessages };

// ---- Rules ----------------------------------------------------------------------------------

const UNITS: Record<string, string> = {
  "overnight-flow": "L/min above baseline",
  burst: "L/min above expected",
  "low-pressure": "kPa",
  "tank-low": "%",
  "tank-high": "%",
  "pump-runtime": "% duty",
  "cool-room-temperature": "°C",
  "hot-water-temperature": "°C",
  "door-open": "min open",
  "leak-wet": "wet",
  "device-offline": "min silent",
};

function RulesSettings() {
  const { data } = useSettings();
  if (!data) return <p className="soft">Loading rules</p>;
  return (
    <section className={styles.section} aria-labelledby="rules-h">
      <h2 id="rules-h" className="t-section">Rules</h2>
      <p className="t-prose soft">Thresholds are set by Pemberton Hall and apply to every building. A condition must hold for the duration before an alert is raised.</p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Rule</th>
            <th scope="col">Severity</th>
            <th scope="col">Active</th>
            <th scope="col">Threshold</th>
            <th scope="col">For</th>
            <th scope="col"><span className="visually-hidden">Save</span></th>
          </tr>
        </thead>
        <tbody>
          {data.rules.map((r) => (
            <RuleRow key={r.id} r={r} />
          ))}
        </tbody>
      </table>
      <p className="t-small">Cold chain and energy rules arrive with those modules. They are not enabled for this account.</p>
    </section>
  );
}

function RuleRow({ r }: { r: ReturnType<typeof useSettings>["data"] extends infer D ? (D extends { rules: Array<infer R> } ? R : never) : never }) {
  const by = useUi((s) => s.role);
  const cmd = useCommand();
  const [t, setT] = useState(String(r.threshold));
  const [d, setD] = useState(String(r.minDurationMin));
  const editable = r.template !== "leak-wet";
  const dirty = t !== String(r.threshold) || d !== String(r.minDurationMin);
  return (
    <tr>
      <td>{r.name}</td>
      <td>
        <StatusGlyph status={r.severity} size={10} /> {r.severity === "critical" ? "Critical" : "Warning"}
      </td>
      <td>{r.schedule ? `${r.schedule.from} to ${r.schedule.to}` : "Always"}</td>
      <td>
        {editable ? (
          <label>
            <span className="visually-hidden">Threshold for {r.name}</span>
            <input className={styles.num} value={t} onChange={(e) => setT(e.target.value)} inputMode="decimal" />
          </label>
        ) : (
          "Wet"
        )}{" "}
        <span className="soft">{editable ? UNITS[r.template] : ""}</span>
      </td>
      <td>
        <label>
          <span className="visually-hidden">Duration for {r.name}, minutes</span>
          <input className={styles.num} value={d} onChange={(e) => setD(e.target.value)} inputMode="numeric" />
        </label>{" "}
        <span className="soft">min</span>
      </td>
      <td>
        <Button variant="quiet" disabled={!dirty} onClick={() => cmd.mutate({ type: "set-rule", ruleId: r.id, threshold: Number(t), minDurationMin: Number(d), by })}>
          {cmd.isSuccess && !dirty ? "Saved" : "Save"}
        </Button>
        {cmd.isError && <span className={styles.inlineError}>{(cmd.error as Error).message}</span>}
      </td>
    </tr>
  );
}

// ---- People ---------------------------------------------------------------------------------

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  "portfolio-manager": "Portfolio manager",
  "building-manager": "Building manager",
  responder: "Responder",
  viewer: "Viewer",
};

function PeopleSettings() {
  const { data } = usePeople();
  if (!data) return <p className="soft">Loading people</p>;
  return (
    <div className={styles.stack}>
      <section className={styles.section} aria-labelledby="people-h">
        <h2 id="people-h" className="t-section">People</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Role</th>
              <th scope="col">Buildings</th>
              <th scope="col">Mobile</th>
              <th scope="col">Email</th>
              <th scope="col">SMS delivery</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.name}</strong>
                  <br />
                  <span className="soft">{p.title}</span>
                </td>
                <td>{ROLE_LABEL[p.role]}</td>
                <td>{p.buildingIds === "all" ? "All 16" : p.buildingIds.length}</td>
                <td>{p.mobileMasked || <span className="soft">None</span>}</td>
                <td className="t-id">{p.email}</td>
                <td>
                  {p.sms.recent === 0 ? (
                    <span className="soft">No SMS yet</span>
                  ) : p.sms.recentFailed ? (
                    <>
                      <StatusGlyph status="warning" size={10} /> {p.sms.recentFailed} of last {p.sms.recent} failed
                    </>
                  ) : (
                    `Last ${p.sms.recent} delivered`
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className={styles.section} aria-labelledby="roles-h">
        <h2 id="roles-h" className="t-section">Roles</h2>
        <dl className={styles.facts}>
          <dt>Admin</dt>
          <dd>Everything, including people, plan and billing.</dd>
          <dt>Portfolio manager</dt>
          <dd>All buildings in their portfolio: incidents, settings for escalation and rules, reports.</dd>
          <dt>Building manager</dt>
          <dd>Their buildings: acknowledge, dispatch, isolate, mute, resolve.</dd>
          <dt>Responder</dt>
          <dd>Incidents they are sent, from the SMS link. No login needed for that link.</dd>
          <dt>Viewer</dt>
          <dd>Read-only access to reports and records, for owners and insurers.</dd>
        </dl>
      </section>
      <TestMessages />
    </div>
  );
}

// ---- Integrations ------------------------------------------------------------------------------

function IntegrationsSettings() {
  const by = useUi((s) => s.role);
  const cmd = useCommand();
  const [keys, setKeys] = useState<Array<{ id: string; label: string; created: string }>>([{ id: "tdm_live_••••••••3f9a", label: "Owners' corporation dashboard", created: "Tue 8 Sep 2026" }]);
  const [webhookResult, setWebhookResult] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).catch(() => undefined);
    setCopied(text);
  };
  return (
    <div className={styles.stack}>
      <p className="t-prose soft">Send readings and incidents to other systems. These connect from this account's side; nothing here changes how devices report.</p>
      <section className={styles.section} aria-labelledby="wh-h">
        <h2 id="wh-h" className="t-section">Webhook</h2>
        <dl className={styles.facts}>
          <dt>Address</dt>
          <dd className="t-id">https://hooks.pembertonhall.example/building-alerts</dd>
          <dt>Sends</dt>
          <dd>Incidents opened, acknowledged and resolved, as JSON</dd>
          <dt>Signing</dt>
          <dd>HMAC-SHA256 in the X-Signature header</dd>
        </dl>
        <div className={styles.row}>
          <Button
            onClick={() => {
              setWebhookResult("Test event delivered: HTTP 200 in 184 ms.");
              cmd.mutate({ type: "setting", target: "Webhook", detail: "Sent a test event to the webhook. Delivered, HTTP 200.", by });
            }}
          >
            Send test event
          </Button>
          {webhookResult && <span role="status">{webhookResult}</span>}
        </div>
      </section>
      <section className={styles.section} aria-labelledby="mqtt-h">
        <h2 id="mqtt-h" className="t-section">MQTT export</h2>
        <dl className={styles.facts}>
          <dt>Broker</dt>
          <dd className="t-id">{`mqtts://export.${brand.name.toLowerCase()}.example:8883`}</dd>
          <dt>Topic</dt>
          <dd className="t-id">pembertonhall/+/readings</dd>
          <dt>Payload</dt>
          <dd className="t-id">{'{"device":"FT-01","t":"2026-11-20T07:47:34+11:00","flow_lpm":80.7}'}</dd>
        </dl>
        <div className={styles.row}>
          <Button onClick={() => copy("pembertonhall/+/readings")}>Copy topic</Button>
          {copied === "pembertonhall/+/readings" && <span role="status">Copied.</span>}
        </div>
      </section>
      <section className={styles.section} aria-labelledby="api-h">
        <h2 id="api-h" className="t-section">REST API keys</h2>
        <ul className={styles.plain}>
          {keys.map((k) => (
            <li key={k.id}>
              <span className="t-id">{k.id}</span> {k.label}, created {k.created}
            </li>
          ))}
        </ul>
        <Button
          onClick={() => {
            const id = `tdm_live_••••••••${Math.random().toString(16).slice(2, 6)}`;
            setKeys((x) => [...x, { id, label: "New key", created: "Fri 20 Nov 2026" }]);
            cmd.mutate({ type: "setting", target: "API key", detail: `Created API key ${id}.`, by });
          }}
        >
          Create a key
        </Button>
      </section>
      <section className={styles.section} aria-labelledby="bms-h">
        <h2 id="bms-h" className="t-section">Building management systems</h2>
        <p className="t-prose">
          BACnet/IP and Modbus TCP connections to an existing BMS are set up by our team on site. None are connected for this account. Readings from a BMS would
          appear as devices on the building's riser, alongside the sensors installed by us.
        </p>
        <Button
          onClick={() => cmd.mutate({ type: "setting", target: "BMS", detail: "Requested a BMS connection survey.", by }, { onSuccess: () => setWebhookResult(null) })}
        >
          Request a site survey
        </Button>
        {cmd.isSuccess && cmd.variables?.type === "setting" && cmd.variables.target === "BMS" && <p role="status">Requested. Our field team will contact you to book a survey.</p>}
      </section>
    </div>
  );
}

// ---- Plan and billing ------------------------------------------------------------------------

function PlanSettings() {
  const { data } = useSettings();
  const by = useUi((s) => s.role);
  const cmd = useCommand();
  const [tariff, setTariff] = useState("");
  const [interest, setInterest] = useState<string | null>(null);
  useEffect(() => {
    if (data && !tariff) setTariff(data.tariffPerKL.toFixed(2));
  }, [data, tariff]);
  if (!data) return <p className="soft">Loading plan and billing</p>;
  return (
    <div className={styles.stack}>
      <section className={styles.section} aria-labelledby="plan-h">
        <h2 id="plan-h" className="t-section">Plan</h2>
        <p>
          <strong>{data.plan.name}</strong>: {data.plan.buildings} buildings, {formatNumber(data.plan.devices)} devices.
        </p>
      </section>
      <section className={styles.section} aria-labelledby="price-h">
        <h2 id="price-h" className="t-section">Prices, ex GST</h2>
        <p className="t-prose soft">Placeholder prices for this demo, not a price list.</p>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col" className={styles.right}>Price</th>
              <th scope="col">Basis</th>
            </tr>
          </thead>
          <tbody>
            {data.pricing.map((p) => (
              <tr key={p.item}>
                <td>{p.item}</td>
                <td className={styles.right}>{formatAUD(p.price)}</td>
                <td>{p.per}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className={styles.section} aria-labelledby="tariff-h">
        <h2 id="tariff-h" className="t-section">Water tariff</h2>
        <form
          className={styles.row}
          onSubmit={(e) => {
            e.preventDefault();
            cmd.mutate({ type: "set-tariff", perKL: Number(tariff), by });
          }}
        >
          <label className={styles.field}>
            <span>A$ per kL, illustrative</span>
            <input value={tariff} onChange={(e) => setTariff(e.target.value)} inputMode="decimal" className={styles.num} />
          </label>
          <Button type="submit" variant="primary">
            Save tariff
          </Button>
        </form>
        <p className="t-small">Every cost figure in the app uses this. Replace it with your water retailer's tariff before showing figures to owners.</p>
        <Feedback error={cmd.error} done={cmd.isSuccess && cmd.variables?.type === "set-tariff" ? `Saved. Costs now use ${formatAUD(Number(tariff), { cents: true })}/kL.` : null} />
      </section>
      <section className={styles.section} aria-labelledby="hw-h">
        <h2 id="hw-h" className="t-section">Hardware installed</h2>
        <table className={styles.table}>
          <tbody>
            {data.hardware.map((h) => (
              <tr key={h.kind}>
                <td>{h.label}</td>
                <td className={styles.right}>{h.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className={styles.section} aria-labelledby="inv-h">
        <h2 id="inv-h" className="t-section">Invoices</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Invoice</th>
              <th scope="col">Period</th>
              <th scope="col">Issued</th>
              <th scope="col" className={styles.right}>Ex GST</th>
              <th scope="col" className={styles.right}>GST</th>
              <th scope="col" className={styles.right}>Total</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.invoices.map((i) => (
              <tr key={i.number}>
                <td>{i.number}</td>
                <td>{i.period}</td>
                <td>{i.issued}</td>
                <td className={styles.right}>{formatAUD(i.amountExGst, { cents: true })}</td>
                <td className={styles.right}>{formatAUD(i.gst, { cents: true })}</td>
                <td className={styles.right}>{formatAUD(i.total, { cents: true })}</td>
                <td>{i.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="t-small">Placeholder amounts.</p>
      </section>
      <section className={styles.section} aria-labelledby="mod-h">
        <h2 id="mod-h" className="t-section">Modules</h2>
        <table className={styles.table}>
          <tbody>
            {data.modules.map((m) => (
              <tr key={m.name}>
                <td>
                  <strong>{m.name}</strong>
                  <br />
                  <span className="soft">{m.detail}</span>
                </td>
                <td>{m.enabled ? "Enabled" : "Not enabled"}</td>
                <td className={styles.right}>
                  {!m.enabled && (
                    <Button
                      variant="quiet"
                      onClick={() =>
                        cmd.mutate({ type: "setting", target: m.name, detail: `Registered interest in the ${m.name} module.`, by }, { onSuccess: () => setInterest(m.name) })
                      }
                    >
                      Register interest
                    </Button>
                  )}
                  {interest === m.name && <span role="status"> Noted. We will be in touch.</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
