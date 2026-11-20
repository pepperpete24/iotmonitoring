/**
 * The demo clock. Starts at Fri 20 Nov 2026 07:48 AEDT and runs at 1x, 10x
 * or 60x. Simulated time = anchorSim + (realNow - anchorReal) * speed.
 */
import { useEffect, useState } from "react";
import { create } from "zustand";
import { DEMO_START } from "@/mock/scenarios/clock";
import type { UtcMs } from "@/domain/common";

export type Speed = 1 | 10 | 60;

interface ClockState {
  anchorSim: UtcMs;
  anchorReal: number;
  speed: Speed;
  paused: boolean;
  setSpeed: (s: Speed) => void;
  setPaused: (p: boolean) => void;
  reset: () => void;
}

const realNow = () => Date.now();

export const useClockStore = create<ClockState>((set, get) => ({
  anchorSim: DEMO_START,
  anchorReal: realNow(),
  speed: 1,
  paused: false,
  setSpeed: (speed) => set({ anchorSim: simNow(), anchorReal: realNow(), speed }),
  setPaused: (paused) => {
    if (paused === get().paused) return;
    set({ anchorSim: simNow(), anchorReal: realNow(), paused });
  },
  reset: () => set({ anchorSim: DEMO_START, anchorReal: realNow(), speed: 1, paused: false }),
}));

/** Current simulated UTC time. Safe to call anywhere. */
export function simNow(): UtcMs {
  const { anchorSim, anchorReal, speed, paused } = useClockStore.getState();
  return paused ? anchorSim : anchorSim + (realNow() - anchorReal) * speed;
}

/**
 * Re-renders on each simulated tick. At 1x that is every second; at higher
 * speeds the real interval stays one second so the UI does not thrash.
 */
export function useSimNow(intervalMs = 1000): UtcMs {
  const speed = useClockStore((s) => s.speed);
  const anchor = useClockStore((s) => s.anchorSim);
  const [now, setNow] = useState(simNow);
  useEffect(() => {
    setNow(simNow());
    const id = window.setInterval(() => setNow(simNow()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, speed, anchor]);
  return now;
}
