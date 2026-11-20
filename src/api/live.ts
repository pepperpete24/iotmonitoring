/**
 * Live updates. A real backend pushes these over a WebSocket; the mock
 * forwards the engine's change events. The UI never reads the engine
 * directly: it refetches through the API when something changes.
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { engine } from "@/mock/runtime";

/** Clock ticks refresh live readings at most this often (real time). */
const TICK_REFRESH_MS = 5_000;

export function useLiveUpdates() {
  const qc = useQueryClient();
  useEffect(() => {
    let lastTick = 0;
    return engine.subscribe((kinds) => {
      const onlyTick = kinds.size === 1 && kinds.has("tick");
      const now = Date.now();
      if (onlyTick && now - lastTick < TICK_REFRESH_MS) return;
      lastTick = now;
      void qc.invalidateQueries();
    });
  }, [qc]);
}
