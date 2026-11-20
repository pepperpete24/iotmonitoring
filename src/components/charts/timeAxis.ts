/** Time ticks in a building's own zone, not the browser's. */
import { formatDate, formatTime, fromLocal, localParts } from "@/lib/format";

const H = 3_600_000;
const D = 24 * H;

const STEPS_H = [1, 2, 3, 6, 12];

export interface Tick {
  t: number;
  label: string;
  major: boolean;
}

/** About `target` ticks between `from` and `to`, on round local hours or days. */
export function timeTicks(from: number, to: number, zone: string, target = 6): Tick[] {
  const span = to - from;
  const out: Tick[] = [];
  if (span <= 2 * D) {
    const stepH = STEPS_H.find((s) => span / (s * H) <= target) ?? 12;
    const p = localParts(from, zone);
    // first local hour on the step at or after `from`
    let y = p.year;
    let mo = p.month;
    let d = p.day;
    let h = Math.ceil((p.hour + (p.minute || p.second ? 1 : 0)) / stepH) * stepH;
    for (let i = 0; i < 200; i++) {
      const t = fromLocal(zone, y, mo, d, h, 0);
      if (t > to) break;
      const lp = localParts(t, zone);
      if (t >= from) {
        const midnight = lp.hour === 0;
        out.push({ t, label: midnight ? formatDate(t, zone, { year: false }) : formatTime(t, zone), major: midnight });
      }
      h += stepH;
      if (h >= 24) {
        const next = localParts(fromLocal(zone, y, mo, d, 12, 0) + D, zone);
        y = next.year;
        mo = next.month;
        d = next.day;
        h -= 24;
      }
    }
    return out;
  }
  const days = span / D;
  const stepD = days <= 8 ? 1 : days <= 21 ? 2 : days <= 45 ? 7 : 14;
  const p = localParts(from, zone);
  let t = fromLocal(zone, p.year, p.month, p.day + 1, 0, 0);
  for (let i = 0; i < 200 && t <= to; i++) {
    const lp = localParts(t, zone);
    const keep = stepD < 7 ? (Math.round((t - from) / D) % stepD === 0 || stepD === 1) : lp.weekday === 1;
    if (keep) out.push({ t, label: formatDate(t, zone, { year: false, weekday: stepD <= 2 }), major: lp.day === 1 });
    const n = localParts(t + D + H, zone);
    t = fromLocal(zone, n.year, n.month, n.day, 0, 0);
  }
  if (stepD >= 7 && out.length > target + 2) return out.filter((_, i) => i % 2 === 0);
  return out;
}

/** Local 01:00 to 04:00 windows that overlap [from, to]. */
export function overnightWindows(from: number, to: number, zone: string): Array<{ from: number; to: number }> {
  const out: Array<{ from: number; to: number }> = [];
  const p = localParts(from - D, zone);
  for (let k = 0; k < 120; k++) {
    const s = fromLocal(zone, p.year, p.month, p.day + k, 1, 0);
    const e = fromLocal(zone, p.year, p.month, p.day + k, 4, 0);
    if (s > to) break;
    if (e > from) out.push({ from: Math.max(from, s), to: Math.min(to, e) });
  }
  return out;
}
