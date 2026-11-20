/** Settings: escalation, rules, plan and billing. */
import type { Engine } from "@/mock/engine/engine";
import { DEVICE_KIND_LABEL, type DeviceKind } from "@/domain/ingestion";
import { BUILDINGS } from "@/mock/world/buildings";
import { personName } from "@/mock/world/people";
import { criticalPolicy, POLICY_OVERRIDES, RULES } from "@/mock/world/rules";
import { allDevices } from "@/mock/world/topology";

/** The research ranges, shown as pricing under test, ex GST. */
export const PRICING_UNDER_TEST = [
  { item: "Starter hardware package", min: 1850, max: 1850, per: "per building" },
  { item: "Installation", min: 650, max: 650, per: "per building" },
  { item: "Monitoring subscription", min: 189, max: 189, per: "per month" },
  { item: "Premium multi-building plan", min: 449, max: 449, per: "per month" },
] as const;

/** The figure used on this demo's invoices, inside the range under test. Illustrative. */
const PLAN_PRICE = 449;

export function settingsView(engine: Engine) {
  const kinds = new Map<DeviceKind, number>();
  for (const d of allDevices()) kinds.set(d.kind, (kinds.get(d.kind) ?? 0) + 1);
  return {
    escalation: BUILDINGS.map((b) => {
      const p = criticalPolicy(b.id);
      return {
        buildingId: b.id,
        name: b.name,
        repeatEveryMin: p.repeatEveryMin,
        edited: POLICY_OVERRIDES.has(b.id),
        steps: p.steps.map((s) => ({ personId: s.personId, person: personName(s.personId), channels: s.channels, waitMin: s.waitMin })),
      };
    }),
    rules: RULES.map((r) => ({ ...r })),
    tariffPerKL: engine.tariffPerKL,
    plan: { name: "Premium multi-building plan", buildings: BUILDINGS.length, devices: allDevices().length, priceUnderTest: PLAN_PRICE },
    pricing: PRICING_UNDER_TEST,
    hardware: [...kinds.entries()].map(([kind, count]) => ({ kind, label: DEVICE_KIND_LABEL[kind], count })).sort((a, z) => z.count - a.count),
    invoices: [
      { number: "INV-2026-0812", period: "September 2026", issued: "Tue 1 Sep 2026", status: "Paid" },
      { number: "INV-2026-0947", period: "October 2026", issued: "Thu 1 Oct 2026", status: "Paid" },
      { number: "INV-2026-1063", period: "November 2026", issued: "Sun 1 Nov 2026", status: "Due Tue 1 Dec 2026" },
    ].map((i) => ({ ...i, amountExGst: PLAN_PRICE, gst: PLAN_PRICE * 0.1, total: PLAN_PRICE * 1.1 })),
    modules: [
      { name: "Building protection", enabled: true, detail: "Leaks, flow, pressure, tanks, pumps and temperature" },
      { name: "Cold chain", enabled: false, detail: "Cool rooms and fridges with food-safety records" },
      { name: "Energy", enabled: false, detail: "Electricity sub-metering and plant run-time" },
    ],
  };
}

export type SettingsView = ReturnType<typeof settingsView>;
