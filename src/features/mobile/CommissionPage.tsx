/**
 * /m/commission: an installer proves a device works before leaving site.
 * A true sequence, so the steps are numbered.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useBuilding, useCommand, useNextTag, usePortfolioStatus } from "@/api/queries";
import { Button } from "@/components/Button";
import { SchematicSymbol } from "@/components/symbols/symbols";
import { DEVICE_KIND_LABEL, type DeviceKind, PLACEHOLDER_MODEL } from "@/domain/ingestion";
import { formatNumber, formatTimeZoned } from "@/lib/format";
import { hashString } from "@/mock/seed";
import { simNow, useSimNow } from "@/state/clock";
import { PhoneFrame } from "./PhoneFrame";
import { symbolFor } from "@/features/building/riserLayout";
import styles from "./Phone.module.css";

const STEPS = ["Scan the label", "Confirm the model", "Where it is", "Name the tag", "Check signal", "Test it", "Photo", "Finish"];
const KINDS: DeviceKind[] = ["leak-sensor", "temperature-probe", "door-contact", "pressure-sensor", "flow-meter", "tank-level", "pump-monitor"];

export function CommissionPage() {
  const now = useSimNow();
  const cmd = useCommand();
  const portfolio = usePortfolioStatus();
  const [step, setStep] = useState(0);
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<DeviceKind>("leak-sensor");
  const [buildingId, setBuildingId] = useState("kendall-street-tower");
  const [levelId, setLevelId] = useState("");
  const [location, setLocation] = useState("");
  const [tag, setTag] = useState("");
  const [photo, setPhoto] = useState("");
  const { data: b } = useBuilding(buildingId);
  const next = useNextTag(buildingId, kind, levelId);
  const zone = b?.summary.zone ?? "Australia/Sydney";
  useEffect(() => {
    if (b && !levelId) setLevelId(b.levels.find((l) => l.short === "B2")?.id ?? b.levels[0]!.id);
  }, [b, levelId]);
  useEffect(() => {
    if (next.data && step === 3 && !tag) setTag(next.data.tag);
  }, [next.data, step, tag]);
  const level = b?.levels.find((l) => l.id === levelId);
  const system = b?.systems.find((s) => s.type !== "network" && s.type !== "refrigeration" && levelId && (s.servesFrom === levelId || s.servesTo === levelId));
  const codeOk = /^[0-9A-F]{16}$/.test(code);
  const finished = cmd.isSuccess;

  const demoLabel = () => {
    // a label code that is unique to this moment of the demo
    const h = hashString(`label:${now}`).toString(16).toUpperCase().padStart(8, "0");
    setCode(`70B3D5E7${h}`.slice(0, 16));
  };

  return (
    <PhoneFrame zone={zone}>
      <p className={styles.stepLabel}>
        Step {Math.min(step + 1, 8)} of 8: {STEPS[Math.min(step, 7)]}
      </p>
      <div className={styles.steps} aria-hidden>
        {STEPS.map((s, k) => (
          <span key={s} className={styles.stepDot} data-done={k <= step} />
        ))}
      </div>

      {step === 0 && (
        <div className={styles.stack}>
          <h1 className={styles.headline}>Scan the device label</h1>
          <div className={styles.camera}>The camera is not available in this demo. Type the 16-character DevEUI printed under the barcode.</div>
          <label className={styles.field}>
            <span>DevEUI</span>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^0-9A-F]/g, "").slice(0, 16))} inputMode="text" autoCapitalize="characters" placeholder="For example 70B3D5E7A0012F3C" className="t-id" />
          </label>
          <Button variant="quiet" onClick={demoLabel}>
            Use the code on the demo label
          </Button>
          <Button variant="primary" size="large" className={styles.big} disabled={!codeOk} onClick={() => setStep(1)}>
            Next
          </Button>
          {code && !codeOk && <p className="t-small">A DevEUI has 16 characters, 0 to 9 and A to F. {16 - code.length} to go.</p>}
        </div>
      )}

      {step === 1 && (
        <div className={styles.stack}>
          <h1 className={styles.headline}>Is this the device?</h1>
          <label className={styles.field}>
            <span>Device</span>
            <select value={kind} onChange={(e) => (setKind(e.target.value as DeviceKind), setTag(""))}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {DEVICE_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <p className={styles.place}>
            <SchematicSymbol kind={symbolFor({ kind, location: "", systemId: null } as never)} size={32} /> {PLACEHOLDER_MODEL[kind]}
            <br />
            <span className="t-id">{code}</span>
          </p>
          <Button variant="primary" size="large" className={styles.big} onClick={() => setStep(2)}>
            Yes, that is it
          </Button>
          <Button variant="quiet" onClick={() => setStep(0)}>
            Scan again
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className={styles.stack}>
          <h1 className={styles.headline}>Where is it?</h1>
          <label className={styles.field}>
            <span>Building</span>
            <select value={buildingId} onChange={(e) => (setBuildingId(e.target.value), setLevelId(""), setTag(""))}>
              {portfolio.data?.buildings.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Level</span>
            <select value={levelId} onChange={(e) => (setLevelId(e.target.value), setTag(""))}>
              {[...(b?.levels ?? [])].sort((a, z) => z.order - a.order).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Exact location</span>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="For example: booster pump room, under P-02" required />
          </label>
          <Button variant="primary" size="large" className={styles.big} disabled={!location.trim()} onClick={() => setStep(3)}>
            Next
          </Button>
        </div>
      )}

      {step === 3 && (
        <div className={styles.stack}>
          <h1 className={styles.headline}>Name the tag</h1>
          <p className={styles.place}>Write this on the device with the label pen, so the next person can find it.</p>
          <label className={styles.field}>
            <span>Tag</span>
            <input value={tag} onChange={(e) => setTag(e.target.value.toUpperCase())} required />
          </label>
          <Button variant="primary" size="large" className={styles.big} disabled={!tag.trim()} onClick={() => setStep(4)}>
            Next
          </Button>
        </div>
      )}

      {step === 4 && <SignalCheck location={location} gateway={b?.devices.filter((d) => d.kind === "gateway").map((d) => d.tag).join(" or ") ?? "the gateway"} onDone={() => setStep(5)} />}

      {step === 5 && <TestUplink tag={tag} zone={zone} onDone={() => setStep(6)} />}

      {step === 6 && (
        <div className={styles.stack}>
          <h1 className={styles.headline}>Take a photo of it installed</h1>
          <div className={styles.camera}>The camera is not available in this demo. Describe the photo below.</div>
          <label className={styles.field}>
            <span>Caption</span>
            <input value={photo} onChange={(e) => setPhoto(e.target.value)} placeholder="For example: sensor on the floor beside the pump plinth" />
          </label>
          <Button variant="primary" size="large" className={styles.big} onClick={() => setStep(7)}>
            {photo ? "Next" : "Skip the photo"}
          </Button>
        </div>
      )}

      {step === 7 && !finished && (
        <div className={styles.stack}>
          <h1 className={styles.headline}>Finish</h1>
          <dl className={styles.place}>
            <dt className="t-small">Device</dt>
            <dd>
              {tag}, {DEVICE_KIND_LABEL[kind].toLowerCase()}
            </dd>
            <dt className="t-small">Where</dt>
            <dd>
              {b?.summary.name}, {level?.label}, {location}
            </dd>
            <dt className="t-small">DevEUI</dt>
            <dd className="t-id">{code}</dd>
          </dl>
          {cmd.isError && <p className={styles.error}>{(cmd.error as Error).message}</p>}
          <Button
            variant="primary"
            size="large"
            className={styles.big}
            onClick={() =>
              cmd.mutate({ type: "commission-device", buildingId, tag: tag.trim(), kind, levelId, systemId: kind === "leak-sensor" ? null : (system?.id ?? null), location: location.trim(), devEui: code, photo: photo.trim() || null, by: "kayla" })
            }
          >
            Commission {tag}
          </Button>
        </div>
      )}

      {finished && (
        <div className={styles.stack}>
          <h1 className={styles.headline}>Commissioned</h1>
          <p className={styles.place}>
            {tag} is reporting and on the record. It now appears in the riser diagram at {level?.label}. You can leave site.
          </p>
          <Link className={styles.state} to={`/buildings/${buildingId}?inspect=device:${encodeURIComponent(`${buildingId}/${tag}`)}`}>
            See it in {b?.summary.name}
          </Link>
          <Button
            size="large"
            className={styles.big}
            onClick={() => {
              cmd.reset();
              setStep(0);
              setCode("");
              setLocation("");
              setTag("");
              setPhoto("");
            }}
          >
            Commission another device
          </Button>
        </div>
      )}
    </PhoneFrame>
  );
}

/** A live RSSI and SNR meter, settling over a few seconds, with a verdict in plain words. */
function SignalCheck({ location, gateway, onDone }: { location: string; gateway: string; onDone: () => void }) {
  const pit = /pit|sump|tank|basement car park/i.test(location);
  const [moved, setMoved] = useState(false);
  const target = pit && !moved ? -116 : -93 - (hashString(location) % 9);
  const [k, setK] = useState(0);
  useEffect(() => {
    setK(0);
    const id = window.setInterval(() => setK((x) => (x >= 6 ? x : x + 1)), 700);
    return () => window.clearInterval(id);
  }, [moved]);
  const settled = k >= 6;
  const rssi = Math.round(target + (settled ? 0 : ((hashString(`${k}${location}`) % 13) - 6)));
  const snr = Math.round((rssi + 100) / 2.2 * 10) / 10;
  const pos = Math.min(100, Math.max(0, ((rssi + 125) / 65) * 100));
  const weak = rssi < -110;
  return (
    <div className={styles.stack}>
      <h1 className={styles.headline}>Check signal</h1>
      <div className={styles.meter} aria-live="polite">
        <div className={styles.meterTrack} role="meter" aria-valuemin={-125} aria-valuemax={-60} aria-valuenow={rssi} aria-label="Signal strength, RSSI">
          <div className={styles.meterWeak} style={{ width: `${((-110 + 125) / 65) * 100}%` }} />
          <div className={styles.meterNeedle} style={{ left: `${pos}%` }} />
        </div>
        <div className={styles.meterScale}>
          <span>-125 dBm</span>
          <span>Weak below -110</span>
          <span>-60 dBm</span>
        </div>
        <p className={styles.liveValue}>
          RSSI {rssi} dBm, SNR {formatNumber(snr, 1)} dB
        </p>
      </div>
      {!settled ? (
        <p className={styles.verdict}>Listening for uplinks via {gateway}. Hold still for a few seconds.</p>
      ) : weak ? (
        <>
          <p className={styles.verdict}>
            <strong>Weak signal.</strong> Uplinks will be missed from here. Move the device up out of the pit, or at least 1 m from the concrete wall, then check again.
          </p>
          <Button variant="primary" size="large" className={styles.big} onClick={() => setMoved(true)}>
            I moved it. Check again
          </Button>
        </>
      ) : (
        <>
          <p className={styles.verdict}>
            <strong>Good signal.</strong> Uplinks will reach {gateway} reliably from here.
          </p>
          <Button variant="primary" size="large" className={styles.big} onClick={onDone}>
            Next
          </Button>
        </>
      )}
    </div>
  );
}

/** Ask for a test uplink and wait for it. */
function TestUplink({ tag, zone, onDone }: { tag: string; zone: string; onDone: () => void }) {
  const [state, setState] = useState<"ready" | "waiting" | "received">("ready");
  const [at, setAt] = useState<number | null>(null);
  useEffect(() => {
    if (state !== "waiting") return;
    const id = window.setTimeout(() => {
      setState("received");
      setAt(simNow());
    }, 2600);
    return () => window.clearTimeout(id);
  }, [state]);
  return (
    <div className={styles.stack}>
      <h1 className={styles.headline}>Test it</h1>
      <p className={styles.place}>Press and hold the button on {tag} for 3 seconds until the light flashes green. It sends a test reading.</p>
      {state === "ready" && (
        <Button variant="primary" size="large" className={styles.big} onClick={() => setState("waiting")}>
          I pressed it
        </Button>
      )}
      {state === "waiting" && <p className={styles.state} aria-live="polite">Waiting for the test uplink</p>}
      {state === "received" && (
        <>
          <p className={styles.state} aria-live="polite">
            Test uplink received at {formatTimeZoned(at!, zone, { seconds: true })}. The reading arrived and cleared.
          </p>
          <Button variant="primary" size="large" className={styles.big} onClick={onDone}>
            Next
          </Button>
        </>
      )}
    </div>
  );
}
