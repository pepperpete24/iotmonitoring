/**
 * Parkside Secondary College rainwater tanks. Levels are simulated hourly
 * backwards from the demo start, so the level at 07:48 on Fri 20 Nov is
 * exactly what the brief states, then forwards for the live demo.
 *
 * Draw: about 2 points a school day for tank 2 (1.5 for tank 1), 0.5 at
 * weekends and in the Term 3 holidays (Sat 19 Sep to Sun 4 Oct 2026).
 * Rain: eight events in the window, two of them light showers in the 14 days
 * before the demo.
 */
import type { UtcMs } from "@/domain/common";
import { fromLocal, localParts } from "@/lib/format";
import type { Effect } from "@/mock/signals/effects";
import { RAINWATER } from "@/mock/signals/signals";
import { DEMO_START } from "@/mock/scenarios/clock";

const H = 3_600_000;
const ZONE = "Australia/Melbourne";
const WINDOW_FROM = Date.UTC(2026, 7, 18);
const HORIZON = DEMO_START + 14 * 24 * H;

const RAIN: Array<{ at: [number, number, number, number]; points: number }> = [
  { at: [2026, 8, 28, 2], points: 20 },
  { at: [2026, 9, 7, 14], points: 16 },
  { at: [2026, 9, 16, 3], points: 10 },
  { at: [2026, 10, 9, 5], points: 16 },
  { at: [2026, 10, 19, 15], points: 18 },
  { at: [2026, 10, 29, 4], points: 14 },
  { at: [2026, 11, 8, 16], points: 5 },
  { at: [2026, 11, 12, 3], points: 4 },
];

const TANKS: Array<{ deviceId: string; levelAtStart: number; schoolDayDraw: number }> = [
  { deviceId: "parkside-secondary/LT-01", levelAtStart: 62, schoolDayDraw: 1.5 },
  { deviceId: "parkside-secondary/LT-02", levelAtStart: 31, schoolDayDraw: 2.0 },
];

function drawPerDay(t: UtcMs, school: number): number {
  const p = localParts(t, ZONE);
  const day = Date.UTC(p.year, p.month - 1, p.day);
  const holidays = day >= Date.UTC(2026, 8, 19) && day <= Date.UTC(2026, 9, 4);
  return p.weekday === 0 || p.weekday === 6 || holidays ? 0.5 : school;
}

export function buildRainwater(): Effect[] {
  const rains = RAIN.map((r) => ({ from: fromLocal(ZONE, r.at[0], r.at[1], r.at[2], r.at[3]), points: r.points }));
  const n = Math.ceil((HORIZON - WINDOW_FROM) / H);
  const iStart = Math.round((DEMO_START - WINDOW_FROM) / H);
  for (const tank of TANKS) {
    const lv = new Float64Array(n + 1);
    lv[iStart] = tank.levelAtStart;
    for (let i = iStart; i > 0; i--) {
      const t = WINDOW_FROM + i * H;
      let v = lv[i]! + drawPerDay(t, tank.schoolDayDraw) / 24;
      for (const r of rains) if (t > r.from && t <= r.from + 6 * H) v -= r.points / 6;
      lv[i - 1] = v;
    }
    for (let i = iStart; i < n; i++) lv[i + 1] = Math.max(0, lv[i]! - drawPerDay(WINDOW_FROM + i * H, tank.schoolDayDraw) / 24);
    // the grid is anchored to whole UTC hours; shift so DEMO_START falls exactly on its sample
    RAINWATER[tank.deviceId] = { t0: DEMO_START - iStart * H, hourly: lv };
  }
  return rains.map((r) => ({
    kind: "rain" as const,
    deviceIds: TANKS.map((t) => t.deviceId),
    points: r.points,
    from: r.from,
    to: r.from + 6 * H,
  }));
}

/** First time a tank falls below `threshold` after `from`, or null. */
export function firstCrossingBelow(deviceId: string, threshold: number, from: UtcMs, to: UtcMs): UtcMs | null {
  const path = RAINWATER[deviceId];
  if (!path) return null;
  for (let i = Math.max(1, Math.floor((from - path.t0) / H)); i < path.hourly.length; i++) {
    const t = path.t0 + i * H;
    if (t > to) break;
    const a = path.hourly[i - 1]!;
    const b = path.hourly[i]!;
    if (a >= threshold && b < threshold) {
      // interpolate within the hour, to the minute
      const f = (a - threshold) / (a - b);
      return Math.round((t - H + f * H) / 60_000) * 60_000;
    }
  }
  return null;
}
