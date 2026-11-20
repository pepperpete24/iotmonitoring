/**
 * The customer's rules, roster and escalation policy. Thresholds are set by
 * the customer; these are Pemberton Hall's settings.
 */
import type { EscalationPolicy, EscalationStep, NotifyChannel, Rule } from "@/domain/building";

export const RULES: readonly Rule[] = [
  {
    id: "overnight-flow",
    template: "overnight-flow",
    name: "Overnight flow above baseline",
    severity: "warning",
    threshold: 3,
    minDurationMin: 30,
    hysteresis: 1,
    schedule: { from: "00:00", to: "05:00" },
    scope: { buildingIds: "all" },
    annunciator: "flow",
  },
  {
    id: "burst",
    template: "burst",
    name: "Flow far above expected (burst)",
    severity: "critical",
    threshold: 20,
    minDurationMin: 2,
    hysteresis: 5,
    schedule: null,
    scope: { buildingIds: "all" },
    annunciator: "flow",
  },
  {
    id: "low-pressure",
    template: "low-pressure",
    name: "Low pressure",
    severity: "warning",
    threshold: 200,
    minDurationMin: 1,
    hysteresis: 15,
    schedule: null,
    scope: { buildingIds: "all" },
    annunciator: "pressure",
  },
  {
    id: "tank-low",
    template: "tank-low",
    name: "Tank low",
    severity: "warning",
    threshold: 40,
    minDurationMin: 15,
    hysteresis: 3,
    schedule: null,
    scope: { buildingIds: "all" },
    annunciator: "tank",
  },
  {
    id: "tank-high",
    template: "tank-high",
    name: "Tank high",
    severity: "critical",
    threshold: 98,
    minDurationMin: 3,
    hysteresis: 2,
    schedule: null,
    scope: { buildingIds: "all" },
    annunciator: "tank",
  },
  {
    id: "pump-runtime",
    template: "pump-runtime",
    name: "Pump duty above normal",
    severity: "warning",
    threshold: 15,
    minDurationMin: 45,
    hysteresis: 3,
    schedule: { from: "00:00", to: "05:00" },
    scope: { buildingIds: "all" },
    annunciator: "pump",
  },
  {
    id: "cool-room",
    template: "cool-room-temperature",
    name: "Cool room above limit",
    severity: "warning",
    threshold: 5,
    minDurationMin: 15,
    hysteresis: 0.5,
    schedule: null,
    scope: { buildingIds: "all" },
    annunciator: "temperature",
  },
  {
    id: "hot-water",
    template: "hot-water-temperature",
    name: "Hot water return below 55 °C",
    severity: "warning",
    threshold: 55,
    minDurationMin: 30,
    hysteresis: 1,
    schedule: null,
    scope: { buildingIds: "all" },
    annunciator: "temperature",
  },
  {
    id: "door-open",
    template: "door-open",
    name: "Cool room door open",
    severity: "warning",
    threshold: 10,
    minDurationMin: 10,
    hysteresis: 0,
    schedule: null,
    scope: { buildingIds: "all" },
    annunciator: "temperature",
  },
  {
    id: "leak-wet",
    template: "leak-wet",
    name: "Leak sensor wet",
    severity: "critical",
    threshold: 1,
    minDurationMin: 0,
    hysteresis: 0,
    schedule: null,
    scope: { buildingIds: "all" },
    annunciator: "leak",
  },
  {
    id: "device-offline",
    template: "device-offline",
    name: "Device or gateway offline",
    severity: "warning",
    threshold: 15,
    minDurationMin: 15,
    hysteresis: 0,
    schedule: null,
    scope: { buildingIds: "all" },
    annunciator: "link",
  },
];

export const ruleById = new Map(RULES.map((r) => [r.id, r]));

/** Who is called, in order, for each building. */
export const ROSTER: Record<string, string[]> = {
  "kendall-street-tower": ["marcus", "tom", "helen"],
  "ellery-house-hotel": ["daniel", "tom", "helen"],
  "marden-square": ["anika", "tom", "helen"],
  "lorne-road-medical": ["ben", "helen"],
  "rosewood-gardens": ["ben", "helen"],
  "140-wexford-street": ["priya", "liam", "helen"],
  "parkside-secondary": ["rhys", "liam", "helen"],
  "the-foundry": ["josh", "liam", "helen"],
  "wattle-grove": ["sandra", "grace", "helen"],
  "riverbend-plaza": ["grace", "helen"],
  "quay-street-offices": ["mei", "grace", "helen"],
  "palmcrest-apartments": ["grace", "helen"],
  "hay-street-exchange": ["ruth", "helen"],
  "glenelg-health-hub": ["ruth", "helen"],
  "norwood-parade-centre": ["ruth", "helen"],
  "wapping-lane": ["liam", "helen"],
};

/** Channels per roster position: first responder by SMS and push, then SMS, Helen by SMS and email. */
function channelsFor(personId: string, position: number): NotifyChannel[] {
  if (personId === "helen") return ["sms", "email"];
  return position === 0 ? ["sms", "push"] : ["sms"];
}

export function criticalPolicy(buildingId: string): EscalationPolicy {
  const roster = ROSTER[buildingId] ?? ["helen"];
  const steps: EscalationStep[] = roster.map((p, i) => ({ order: i + 1, personId: p, channels: channelsFor(p, i), waitMin: 10 }));
  return {
    id: `critical/${buildingId}`,
    name: "Critical alerts",
    severity: "critical",
    steps,
    repeatEveryMin: 60,
    warningSmsQuiet: { from: "22:00", to: "06:00" },
  };
}

export function warningPolicy(buildingId: string): EscalationPolicy {
  const first = ROSTER[buildingId]?.[0] ?? "helen";
  return {
    id: `warning/${buildingId}`,
    name: "Warnings",
    severity: "warning",
    steps: [{ order: 1, personId: first, channels: ["email", "push", "sms"], waitMin: 0 }],
    repeatEveryMin: 0,
    warningSmsQuiet: { from: "22:00", to: "06:00" },
  };
}
