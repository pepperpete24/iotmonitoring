/** The building header's status sentence, computed from its state. Never typed. */
import type { BuildingDetail, IncidentSummary } from "@/api/types";
import { countWord, formatDuration, formatNumber, formatTime, plural } from "@/lib/format";

function ackWords(i: IncidentSummary): string {
  return i.state === "open" ? "not acknowledged" : i.state === "dispatched" ? "dispatched" : `acknowledged by ${i.acknowledgedBy ?? "someone"}`;
}

function incidentClause(i: IncidentSummary, now: number): string {
  // lower-case the first word only if it is an ordinary word ("Kitchen", not "B2" or "Level 21")
  const first = i.location.split(/[ ,]/)[0] ?? "";
  const keep = /\d/.test(first) || first === first.toUpperCase() || first === "Level" || first === "Ground" || first === "Roof";
  const where = keep ? i.location : i.location.charAt(0).toLowerCase() + i.location.slice(1);
  const sev = i.severity === "critical" ? "critical" : "warning";
  const ack = ackWords(i);
  // "Rainwater tank 2 low" at "Rainwater tank 2, Building C": say the place once
  const [head, ...rest] = i.location.split(", ");
  if (head && i.title.toLowerCase().includes(head.toLowerCase())) {
    return `${i.title}${rest.length ? `, ${rest.join(", ")}` : ""}, ${sev} for ${formatDuration(now - i.severitySince)}, ${ack}.`;
  }
  const prep = /^(Level \d+|Ground|Roof)$/.test(i.location) ? "on" : /^(Level|Ground|Roof)/.test(i.location) ? "at" : "in the";
  return `${i.title} ${prep} ${where}, ${sev} for ${formatDuration(now - i.severitySince)}, ${ack}.`;
}

export function statusSentence(b: BuildingDetail, now: number): string {
  const open = b.incidents.filter((i) => i.state !== "resolved");
  const parts: string[] = [];
  const order = [...open].sort((a, z) => Number(a.severity !== "critical") - Number(z.severity !== "critical"));
  const top = order[0];
  if (top) parts.push(incidentClause(top, now));
  if (top && top.waterLostL !== null) parts.push(`${formatNumber(top.waterLostL / 1000, 2)} kL lost so far.`);
  if (order.length > 1) parts.push(`${countWord(order.length - 1)} other open ${order.length - 1 === 1 ? "incident" : "incidents"}.`);
  const offline = b.devices.filter((d) => d.status === "offline");
  const paused = b.devices.filter((d) => d.status === "paused");
  const muted = b.devices.filter((d) => d.status === "muted");
  if (offline.length) parts.push(`${offline.map((d) => d.tag).join(", ")} offline.`);
  if (paused.length) parts.push(`${plural(paused.length, "device")} paused behind an offline gateway.`);
  if (muted.length) {
    const until = muted[0]!.muteUntil;
    parts.push(`${plural(muted.length, "device")} muted${until ? ` until ${formatTime(until, b.summary.zone)}` : ""}${muted[0]!.muteReason ? `: ${muted[0]!.muteReason.toLowerCase()}` : ""}.`);
  }
  if (!parts.length) {
    parts.push(`All ${b.devices.length} devices reporting. No open incidents.`);
  }
  return parts.join(" ");
}
