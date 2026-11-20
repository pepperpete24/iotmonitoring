/**
 * The portfolio briefing: computed from the data, never typed.
 * Returns segments so key facts can be set in a heavier weight.
 */
import type { PortfolioStatus } from "@/api/types";
import { countWord, formatDuration, formatNumber, plural } from "@/lib/format";

export type Segment = { text: string; strong?: boolean };

export function briefingSegments(p: PortfolioStatus): Segment[] {
  const b = p.briefing;
  const name = (id: string) => p.buildings.find((x) => x.id === id)?.name ?? id;
  const out: Segment[] = [];
  if (b.critical.length === 0) {
    out.push({ text: "No critical incidents. " });
  } else if (b.critical.length === 1) {
    const c = b.critical[0]!;
    out.push({ text: `One critical incident, ${c.acknowledged ? "acknowledged" : "not yet acknowledged"}: ` });
    out.push({ text: name(c.buildingId), strong: true });
    out.push({ text: ", critical for " });
    out.push({ text: formatDuration(c.criticalForMs), strong: true });
    out.push({ text: ". " });
  } else {
    const unacked = b.critical.filter((c) => !c.acknowledged).length;
    out.push({ text: `${countWord(b.critical.length)} critical incidents` });
    out.push({ text: unacked ? `, ${countWord(unacked, false)} not yet acknowledged: ` : ": " });
    b.critical.forEach((c, i) => {
      out.push({ text: name(c.buildingId), strong: true });
      out.push({ text: ` for ${formatDuration(c.criticalForMs)}${i < b.critical.length - 1 ? "; " : ". "}` });
    });
  }
  out.push({ text: b.warnings ? `${plural(b.warnings, "warning")}. ` : "No warnings. " });
  if (b.offline) out.push({ text: `${plural(b.offline, "device")} offline. ` });
  if (b.muted) out.push({ text: `${plural(b.muted, "device")} muted.` });
  return out;
}

/** The second sentence: water in the last 24 hours against the usual weekday. */
export function waterSentence(p: PortfolioStatus): string {
  const b = p.briefing;
  const kl = b.water24hL / 1000;
  const pct = b.water24hUsualL ? Math.round((b.water24hL / b.water24hUsualL - 1) * 100) : 0;
  const cmp = Math.abs(pct) < 1 ? `in line with the usual ${b.weekday}` : `${Math.abs(pct)}% ${pct > 0 ? "above" : "below"} the usual ${b.weekday}`;
  return `Water used in the last 24 hours: ${formatNumber(kl, 0)} kL, ${cmp}.`;
}
