/**
 * The in-browser stand-in for the backend process: one engine, a one-second
 * tick, and session persistence. Commands and the clock are kept in
 * sessionStorage, so a reload replays the session to the same moment.
 */
import { Engine, type Command, type StampedCommand } from "@/mock/engine/engine";
import { DEMO_START } from "@/mock/scenarios/clock";
import { simNow, useClockStore } from "@/state/clock";

export const engine = new Engine();

const KEY = "tidemark.session.v1";

interface Saved {
  commands: StampedCommand[];
  clock: { anchorSim: number; anchorReal: number; speed: 1 | 10 | 60; paused: boolean };
}

function save() {
  try {
    const { anchorSim, anchorReal, speed, paused } = useClockStore.getState();
    const data: Saved = { commands: engine.commands, clock: { anchorSim, anchorReal, speed, paused } };
    sessionStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage blocked: the session simply does not survive a reload */
  }
}

function load(): Saved | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

/** Bring the engine up to the current simulated time. */
export function sync() {
  engine.advanceTo(simNow());
}

/** Apply a person's action now. Throws CommandError if refused. */
export function runCommand(cmd: Command) {
  sync();
  engine.apply(cmd);
  save();
}

/** Back to 07:48, nothing done. */
export function resetDemo() {
  useClockStore.getState().reset();
  engine.reset();
  save();
}

let started = false;
export function startRuntime() {
  if (started) return;
  started = true;
  const saved = load();
  if (saved) {
    // Replay: the same commands at the same simulated times give the same world.
    for (const c of saved.commands) {
      engine.advanceTo(c.at);
      try {
        engine.apply(c.cmd);
      } catch {
        /* a command that was refused live is refused again; skip it */
      }
    }
    if (saved.clock.anchorSim >= DEMO_START) useClockStore.setState(saved.clock);
  }
  sync();
  useClockStore.subscribe(save);
  window.setInterval(sync, 1000);
}
