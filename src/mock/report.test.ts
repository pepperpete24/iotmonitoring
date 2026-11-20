import { describe, expect, it } from "vitest";
import { Engine } from "@/mock/engine/engine";
import { monthlyReport } from "@/mock/views-reports";
import { waterLostL } from "@/mock/selectors/compute";
import { fromLocal } from "@/lib/format";

describe("October 2026 report", () => {
  const e = new Engine();
  const r = monthlyReport(e, "2026-10", e.now);
  const from = fromLocal("Australia/Sydney", 2026, 10, 1, 0, 0);
  const to = fromLocal("Australia/Sydney", 2026, 11, 1, 0, 0);
  const table = e.world.incidents.filter((i) => i.openedAt >= from && i.openedAt < to);

  it("counts exactly the incidents in the incident table for October", () => {
    expect(r.totals.incidents).toBe(table.length);
    expect(r.incidents.map((i) => i.id)).toEqual(table.map((i) => i.id).sort());
    expect(r.byCategory.reduce((s, c) => s + c.count, 0)).toBe(table.length);
    expect(r.byBuilding.reduce((s, b) => s + b.count, 0)).toBe(table.length);
  });

  it("reconciles water lost with the incident table", () => {
    const water = table.reduce((s, i) => s + (waterLostL(i, e.now) ?? 0), 0);
    expect(r.totals.waterLostL).toBeCloseTo(water, 6);
    expect(r.byCategory.reduce((s, c) => s + c.waterLostL, 0)).toBeCloseTo(water, 6);
  });

  it("includes the Foundry burst as the slowest response and the largest loss", () => {
    const foundry = r.incidents.find((i) => i.buildingId === "the-foundry" && i.category === "burst")!;
    expect(foundry).toBeDefined();
    expect(r.totals.slowest?.incidentId).toBe(foundry.id);
    expect(r.totals.slowest?.ackMin).toBe(225);
    expect(r.totals.largestLoss?.incidentId).toBe(foundry.id);
  });
});
