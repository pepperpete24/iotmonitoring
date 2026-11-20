/**
 * Eight windows borrowed from plant-room alarm panels. Outlined when normal,
 * filled in the status colour when abnormal, always with the status glyph so
 * it reads in greyscale. Flat, no glow.
 */
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  ANNUNCIATOR_CHANNELS,
  ANNUNCIATOR_LABEL,
  type AnnunciatorState,
  STATUS_LABEL,
} from "@/domain/common";
import { StatusGlyph } from "./status/StatusGlyph";
import styles from "./Annunciator.module.css";

interface Props {
  state: AnnunciatorState;
  variant?: "full" | "compact";
  /** Accessible name prefix, for example the building name. */
  label?: string;
}

export function Annunciator({ state, variant = "full", label }: Props) {
  const lit = ANNUNCIATOR_CHANNELS.filter((c) => state[c]);
  const summary = lit.length
    ? lit.map((c) => `${ANNUNCIATOR_LABEL[c]} ${STATUS_LABEL[state[c]!].toLowerCase()}`).join(", ")
    : "all normal";
  const name = `${label ? `${label} annunciator` : "Annunciator"}: ${summary}`;

  if (variant === "compact") {
    return (
      <Tooltip.Provider delayDuration={250}>
        <ul className={`${styles.panel} ${styles.compact}`} aria-label={name}>
          {ANNUNCIATOR_CHANNELS.map((c) => {
            const st = state[c];
            const word = `${ANNUNCIATOR_LABEL[c]}: ${st ? STATUS_LABEL[st].toLowerCase() : "normal"}`;
            return (
              <Tooltip.Root key={c}>
                <Tooltip.Trigger asChild>
                  <li className={styles.window} data-status={st ?? "normal"} aria-label={word}>
                    {st && <StatusGlyph status={st} size={10} onFill />}
                  </li>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content className="tooltip" sideOffset={4}>
                    {word}
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            );
          })}
        </ul>
      </Tooltip.Provider>
    );
  }

  return (
    <ul className={`${styles.panel} ${styles.full}`} aria-label={name}>
      {ANNUNCIATOR_CHANNELS.map((c) => {
        const st = state[c];
        return (
          <li key={c} className={styles.window} data-status={st ?? "normal"}>
            {st && <StatusGlyph status={st} size={10} onFill />}
            <span>{ANNUNCIATOR_LABEL[c]}</span>
            {st && <span className="visually-hidden">, {STATUS_LABEL[st].toLowerCase()}</span>}
          </li>
        );
      })}
    </ul>
  );
}
