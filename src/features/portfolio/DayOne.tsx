/**
 * The first hour of a new customer: no buildings yet. Says what will appear
 * and what to have ready, and offers the one next step.
 */
import { useState } from "react";
import { useCommand } from "@/api/queries";
import { Button } from "@/components/Button";
import { useUi } from "@/state/ui";
import styles from "./PortfolioPage.module.css";

const READY = [
  "The address and type of each building, and how many levels and basements it has.",
  "Where the main water meter, the booster pumps, the tanks and the plant rooms are.",
  "Who to call for each building, in order, with their mobile numbers. These become the roster.",
  "How the installer gets in: car park access, keys, the lockbox code.",
  "Your water retailer's tariff, so costs are in your own dollars.",
];

export function DayOne({ organisation }: { organisation: string }) {
  const by = useUi((s) => s.role);
  const cmd = useCommand();
  const [done, setDone] = useState(false);
  return (
    <div className={styles.dayOne}>
      <h1 className="t-title">Add your first building</h1>
      <p className="t-briefing">
        {organisation} has no buildings yet. Once the first one is installed, this page leads with a sentence saying which building needs you, followed by every
        building in order of attention.
      </p>
      <section className={styles.ready} aria-labelledby="ready-h">
        <h2 id="ready-h" className="t-section">
          What to have ready
        </h2>
        <ol>
          {READY.map((r, k) => (
            <li key={k}>{r}</li>
          ))}
        </ol>
      </section>
      <p className="t-prose">An installer commissions each device on site in about two minutes, and checks it is reporting before leaving. Alerts start the moment the first device reports.</p>
      <div className={styles.links}>
        <Button
          variant="primary"
          onClick={() =>
            cmd.mutate({ type: "setting", target: "Onboarding", detail: "A new customer asked to book a site survey for their first building.", by }, { onSuccess: () => setDone(true) })
          }
        >
          Book a site survey
        </Button>
      </div>
      {done && <p role="status">Booked. Our field team will call within one business day to arrange a time.</p>}
    </div>
  );
}
