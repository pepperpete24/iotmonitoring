/**
 * Escalation: who is notified, on which channel, when, and what happened to
 * each message. One pure function serves the history fixtures, the hero
 * incident before 07:48 and the live engine afterwards.
 */
import type { DeliveryResult, EscalationPolicy, Notification, NotifyChannel } from "@/domain/building";
import type { UtcMs } from "@/domain/common";
import { formatTime, localHour } from "@/lib/format";
import { hashString } from "@/mock/seed";
import { buildingById } from "@/mock/world/buildings";
import { personById } from "@/mock/world/people";
import { brand } from "@/brand";

const MIN = 60_000;

/** The short link in an SMS that opens the responder view. */
export const respondLink = (incidentId: string) => `${brand.name.toLowerCase()}.example/r/${incidentId.slice(-4)}`;

function inWindow(zone: string, t: UtcMs, w: { from: string; to: string }): boolean {
  const h = localHour(t, zone);
  const [fh, fm] = w.from.split(":").map(Number) as [number, number];
  const [th, tm] = w.to.split(":").map(Number) as [number, number];
  const from = fh + fm / 60;
  const to = th + tm / 60;
  return from <= to ? h >= from && h < to : h >= from || h < to;
}

export interface ContactState {
  /** Person ids whose mobile number fails. Fixing the number removes them. */
  faultyMobiles: Set<string>;
}

interface MessageInput {
  incidentId: string;
  buildingName: string;
  zone: string;
  personId: string;
  channel: NotifyChannel;
  at: UtcMs;
  critical: boolean;
  summary: string;
  link: string;
  contacts: ContactState;
  step: number | null;
  stepSeq: number | null;
  cycle: number | null;
}

function deliver(m: MessageInput): Notification {
  const person = personById.get(m.personId);
  let result: DeliveryResult = "delivered";
  let detail = "Delivered";
  const quiet = person?.quietHours && m.channel === "sms" && inWindow(m.zone, m.at, person.quietHours);
  if (quiet) {
    result = "held";
    detail = `Held: ${person!.name.split(" ")[0]}'s quiet hours, ${person!.quietHours!.from} to ${person!.quietHours!.to}`;
  } else if (!m.critical && m.channel === "sms" && inWindow(m.zone, m.at, { from: "22:00", to: "06:00" })) {
    result = "held";
    detail = "Not sent: warnings are not texted between 22:00 and 06:00";
  } else if (m.channel === "sms" && m.contacts.faultyMobiles.has(m.personId)) {
    result = "failed";
    detail = "Failed: number not in service";
  } else if (m.channel === "push") {
    detail = "Delivered, not opened";
  } else if (m.channel === "sms") {
    detail = "Delivered, no reply";
  }
  const delay = 4_000 + (hashString(`${m.incidentId}${m.personId}${m.channel}${m.at}`) % 16_000);
  const time = formatTime(m.at, m.zone);
  const body =
    m.channel === "email"
      ? `${m.critical ? "Critical" : "Warning"}: ${m.summary}, ${m.buildingName}. Raised ${time}. Incident ${m.incidentId}. ${m.link}`
      : `${m.critical ? "Critical" : "Warning"}, ${m.buildingName}: ${m.summary}. ${m.incidentId}. Acknowledge: ${m.link}`;
  return {
    id: `N-${m.incidentId}-${m.at}-${m.personId}-${m.channel}`,
    incidentId: m.incidentId,
    step: m.step,
    stepSeq: m.stepSeq,
    cycle: m.cycle,
    personId: m.personId,
    channel: m.channel,
    at: m.at + (result === "held" ? 0 : delay),
    result,
    detail,
    body,
  };
}

export interface EscalationRun {
  notifications: Notification[];
  /** Step starts, for the Logbook: one entry per step. */
  steps: Array<{ at: UtcMs; stepSeq: number; cycle: number; order: number; personId: string; notifications: Notification[] }>;
}

/**
 * Critical escalation for one incident between `from` (exclusive of steps
 * already run, inclusive of `from`) and `until`, stopping at `ackAt`.
 */
export function runCriticalEscalation(args: {
  incidentId: string;
  buildingId: string;
  policy: EscalationPolicy;
  criticalSince: UtcMs;
  from: UtcMs;
  until: UtcMs;
  ackAt: UtcMs | null;
  summary: string;
  contacts: ContactState;
}): EscalationRun {
  const b = buildingById.get(args.buildingId)!;
  const out: EscalationRun = { notifications: [], steps: [] };
  const cycleMs = args.policy.repeatEveryMin * MIN;
  const stepsPerCycle = args.policy.steps.length;
  for (let cycle = 0; ; cycle++) {
    const cycleStart = args.criticalSince + cycle * cycleMs;
    if (cycleStart > args.until) break;
    let offset = 0;
    for (const step of args.policy.steps) {
      const at = cycleStart + offset;
      offset += step.waitMin * MIN;
      if (at < args.from || at > args.until) continue;
      if (args.ackAt !== null && at >= args.ackAt) return out;
      const stepSeq = cycle * stepsPerCycle + step.order;
      const sent = step.channels.map((channel) =>
        deliver({
          incidentId: args.incidentId,
          buildingName: b.name,
          zone: b.zone,
          personId: step.personId,
          channel,
          at,
          critical: true,
          summary: args.summary,
          link: respondLink(args.incidentId),
          contacts: args.contacts,
          step: step.order,
          stepSeq,
          cycle: cycle + 1,
        }),
      );
      out.notifications.push(...sent);
      out.steps.push({ at, stepSeq, cycle: cycle + 1, order: step.order, personId: step.personId, notifications: sent });
    }
    if (cycleMs <= 0) break;
  }
  return out;
}

/** The one-off notice when a warning incident opens. */
export function warningNotice(args: {
  incidentId: string;
  buildingId: string;
  policy: EscalationPolicy;
  at: UtcMs;
  summary: string;
  contacts: ContactState;
}): Notification[] {
  const b = buildingById.get(args.buildingId)!;
  const step = args.policy.steps[0]!;
  return step.channels.map((channel) =>
    deliver({
      incidentId: args.incidentId,
      buildingName: b.name,
      zone: b.zone,
      personId: step.personId,
      channel,
      at: args.at,
      critical: false,
      summary: args.summary,
      link: respondLink(args.incidentId),
      contacts: args.contacts,
      step: null,
      stepSeq: null,
      cycle: null,
    }),
  );
}

/** A test message, sent from Settings after fixing a contact. */
export function testMessage(personId: string, at: UtcMs, contacts: ContactState): Notification {
  return deliver({
    incidentId: "TEST",
    buildingName: "Test message",
    zone: "Australia/Sydney",
    personId,
    channel: "sms",
    at,
    critical: true,
    summary: "This is a test of your alert contact details",
    link: "",
    contacts,
    step: null,
    stepSeq: null,
    cycle: null,
  });
}

/** Messages that count: held SMS were never sent. */
export const sentOnly = (ns: readonly Notification[]) => ns.filter((n) => n.result !== "held");
