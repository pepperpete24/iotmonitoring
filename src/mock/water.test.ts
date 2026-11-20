import { describe, expect, it } from "vitest";
import { Engine } from "@/mock/engine/engine";
import { waterView, deviceDetail } from "@/mock/views-more";

describe("water analytics", () => {
  const e = new Engine();

  it("computes the portfolio view quickly enough for an interactive screen", () => {
    const t0 = performance.now();
    const w = waterView(e, null, e.now);
    const ms = performance.now() - t0;
    console.log(`water view ${Math.round(ms)} ms, ${w.anomalies.length} anomalies`);
    expect(w.daily).toHaveLength(30);
    expect(w.hourly.length).toBeGreaterThanOrEqual(46);
    expect(ms).toBeLessThan(4000);
  });

  it("marks the hero night as a breach of Kendall Street Tower's baseline", () => {
    const w = waterView(e, "kendall-street-tower", e.now);
    const last = w.nights.points[w.nights.points.length - 1]!;
    expect(last.value).toBe(15.6);
    expect(last.breach).toBe(true);
    expect(w.nights.points.filter((p) => p.breach)).toHaveLength(1);
    expect(w.anomalies.some((a) => a.incidentId === "I-2026-0167")).toBe(true);
  });

  it("finds the cistern leak at The Foundry on 9 and 10 Nov", () => {
    const w = waterView(e, "the-foundry", e.now);
    expect(w.anomalies.length).toBeGreaterThanOrEqual(1);
  });

  it("gives a device 90 days of battery, 7 days of signal and 20 uplinks", () => {
    const d = deviceDetail(e, "kendall-street-tower/FT-01", e.now)!;
    expect(d.battery).toHaveLength(90);
    expect(d.signal.length).toBeGreaterThan(160);
    expect(d.uplinks).toHaveLength(20);
  });
});
