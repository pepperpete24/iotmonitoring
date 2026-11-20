/**
 * Invariants from the brief's data specification. If one fails, the demo
 * is telling the wrong story.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { DAY, formatAUD, formatDuration, formatNumber, formatTimeZoned, fromLocal, HOUR, localParts, MINUTE } from "@/lib/format";
import { Engine } from "@/mock/engine/engine";
import { DEMO_START } from "@/mock/scenarios/clock";
import { sample } from "@/mock/signals/signals";
import { lastUplink } from "@/mock/signals/uplinks";
import { BUILDINGS, buildingById } from "@/mock/world/buildings";
import { allDevices, deviceById } from "@/mock/world/topology";
import { FIRMWARE_LATEST } from "@/mock/world/topology";
import {
  allBuildingRows,
  briefing,
  costAUD,
  dailyLossL,
  escalationSummary,
  fleetExceptions,
  nightBaseline,
  nightFlow,
  waterLostL,
} from "@/mock/selectors/compute";

let engine: Engine;
beforeAll(() => {
  engine = new Engine();
});

const hero = () => engine.world.incidents.find((i) => i.id === "I-2026-0167")!;
const ch = (id: string, m: string) => deviceById(id)!.channels.find((c) => c.measure === m)!;
const aedt = (d: number, h: number, mi: number) => fromLocal("Australia/Sydney", 2026, 11, d, h, mi);

describe("the world", () => {
  it("has 16 buildings and 413 devices, matching each building's count", () => {
    expect(BUILDINGS).toHaveLength(16);
    expect(allDevices()).toHaveLength(413);
    for (const b of BUILDINGS) expect(allDevices().filter((d) => d.buildingId === b.id)).toHaveLength(b.deviceCount);
  });

  it("gives every device a unique 16-digit hex DevEUI", () => {
    const euis = allDevices().map((d) => d.devEui);
    expect(new Set(euis).size).toBe(413);
    for (const e of euis) expect(e).toMatch(/^[0-9A-F]{16}$/);
  });

  it("never gives two devices the same battery level", () => {
    const levels = allDevices().map((d) => d.batteryAtStart.toFixed(1));
    expect(new Set(levels).size).toBe(413);
  });

  it("has 6 devices under 20% battery and 5 with weak signal, including PT-03 at Hay Street", () => {
    const ex = fleetExceptions(engine, DEMO_START);
    expect(ex.lowBattery).toHaveLength(6);
    expect(ex.weakSignal).toHaveLength(5);
    expect(ex.weakSignal.map((d) => d.id)).toContain("hay-street-exchange/PT-03");
  });

  it("has one device on older firmware", () => {
    const old = allDevices().filter((d) => d.firmware !== FIRMWARE_LATEST[d.kind]);
    expect(old).toHaveLength(1);
  });

  it("uses placeholder models only", () => {
    for (const d of allDevices()) expect(d.model).toMatch(/^(LoRaWAN|Cellular) /);
  });
});

describe("history", () => {
  it("has 46 resolved incidents in the brief's mix", () => {
    const resolved = engine.world.incidents.filter((i) => i.state === "resolved");
    expect(resolved).toHaveLength(46);
    const count = (c: string) => resolved.filter((i) => i.category === c).length;
    expect(count("leak-minor")).toBe(10);
    expect(count("leak-false-alarm")).toBe(5);
    expect(count("overnight-flow")).toBe(4);
    expect(count("pump")).toBe(5);
    expect(count("tank")).toBe(5);
    expect(count("cool-room")).toBe(6);
    expect(count("hot-water")).toBe(3);
    expect(count("low-pressure")).toBe(2);
    expect(count("gateway-offline")).toBe(3);
    expect(count("burst")).toBe(3);
  });

  it("keeps every incident inside the 90-day window", () => {
    for (const i of engine.world.incidents) {
      expect(i.openedAt).toBeGreaterThanOrEqual(Date.UTC(2026, 7, 21, 14));
      expect(i.openedAt).toBeLessThan(DEMO_START);
    }
  });

  it("acknowledges in a median of 6 min in business hours and 23 min after hours", () => {
    const business: number[] = [];
    const after: number[] = [];
    for (const i of engine.world.incidents) {
      if (i.state !== "resolved" || i.acknowledgedAt === null || i.acknowledgedBy === null) continue;
      const b = buildingById.get(i.buildingId)!;
      const p = localParts(i.openedAt, b.zone);
      const weekday = p.weekday >= 1 && p.weekday <= 5;
      const inHours = weekday && p.hour >= 8 && p.hour < 18;
      (inHours ? business : after).push((i.acknowledgedAt - i.openedAt) / MINUTE);
    }
    const median = (xs: number[]) => {
      const s = [...xs].sort((a, b) => a - b);
      const m = s.length / 2;
      return s.length % 2 ? s[Math.floor(m)]! : (s[m - 1]! + s[m]!) / 2;
    };
    expect(median(business)).toBe(6);
    expect(median(after)).toBe(23);
    expect(Math.max(...after)).toBeGreaterThan(200); // a visible tail
    expect(Math.max(...after, ...business)).toBe(225); // the Foundry burst is the slowest of the quarter
  });

  it("records the Foundry burst: 260 min, 9.88 kL, acknowledged after 3 h 45 min", () => {
    const f = engine.world.incidents.find((i) => i.buildingId === "the-foundry" && i.category === "burst")!;
    expect(formatTimeZoned(f.openedAt, "Australia/Melbourne")).toBe("03:20 AEST");
    expect(formatDuration(f.acknowledgedAt! - f.openedAt)).toBe("3 h 45 min");
    expect(formatNumber(waterLostL(f, DEMO_START)! / 1000, 2)).toBe("9.88");
  });

  it("records the running toilet: 3.1 L/min for 11 days, 49.1 kL", () => {
    const t = engine.world.incidents.find((i) => i.buildingId === "palmcrest-apartments" && i.category === "overnight-flow")!;
    expect((t.leak!.to! - t.leak!.from) / DAY).toBe(11);
    expect(formatNumber(waterLostL(t, DEMO_START)! / 1000, 1)).toBe("49.1");
  });

  it("shows AEST for Melbourne before 4 Oct and AEDT after", () => {
    const f = engine.world.incidents.find((i) => i.buildingId === "the-foundry" && i.category === "burst")!;
    expect(formatTimeZoned(f.openedAt, "Australia/Melbourne")).toMatch(/AEST$/);
    const w = engine.world.incidents.find((i) => i.buildingId === "140-wexford-street" && i.category === "low-pressure")!;
    expect(formatTimeZoned(w.openedAt, "Australia/Melbourne")).toMatch(/AEDT$/);
  });
});

describe("the hero incident at 07:48", () => {
  it("is I-2026-0167 at Kendall Street Tower, critical and not acknowledged", () => {
    const h = hero();
    expect(h.buildingId).toBe("kendall-street-tower");
    expect(h.severity).toBe("critical");
    expect(h.state).toBe("open");
    expect(h.alertIds).toHaveLength(3);
  });

  it("has been critical for 3 h 36 min and open for 5 h 38 min", () => {
    expect(formatDuration(DEMO_START - hero().severitySince)).toBe("3 h 36 min");
    expect(formatDuration(DEMO_START - hero().openedAt)).toBe("5 h 38 min");
  });

  it("ran 12 escalation steps and sent 18 messages: 14 delivered, 4 failed", () => {
    const s = escalationSummary(hero(), engine.world.notifications);
    expect(s).toMatchObject({ steps: 12, messages: 18, delivered: 14, failed: 4, acknowledged: false });
  });

  it("held Helen's SMS in her quiet hours at 04:32 and 05:32 only", () => {
    const held = engine.world.notifications.filter((n) => n.incidentId === "I-2026-0167" && n.result === "held" && n.stepSeq !== null);
    expect(held.map((n) => formatTimeZoned(n.at, "Australia/Sydney"))).toEqual(["04:32 AEDT", "05:32 AEDT"]);
  });

  it("has lost 2,281.6 L since 01:40, A$7.99 at A$3.50/kL", () => {
    const l = waterLostL(hero(), DEMO_START)!;
    expect(formatNumber(l, 1)).toBe("2,281.6");
    expect(formatAUD(costAUD(l, 3.5)!)).toBe("A$7.99");
  });

  it("would lose 8.93 kL a day, A$31.25, if left unattended", () => {
    const d = dailyLossL(hero())!;
    expect(formatNumber(d / 1000, 2)).toBe("8.93");
    expect(formatAUD(costAUD(d, 3.5)!)).toBe("A$31.25");
  });

  it("shows the overnight floor at 9.4 L/min before 01:40 and 15.6 L/min after", () => {
    const ft = ch("kendall-street-tower/FT-01", "flow");
    const blockMean = (h: number, m: number) => {
      let s = 0;
      for (let i = 0; i < 30; i++) s += sample(ft, aedt(20, h, m) + i * MINUTE, engine.world.effects)!;
      return Math.round((s / 30) * 10) / 10;
    };
    expect(blockMean(1, 0)).toBe(9.4);
    expect(blockMean(2, 0)).toBe(15.6);
    expect(blockMean(3, 30)).toBe(15.6);
    const b = buildingById.get("kendall-street-tower")!;
    expect(nightFlow(engine, b, aedt(20, 2, 0))).toBe(15.6);
    const base = nightBaseline(engine, b, aedt(20, 2, 0));
    expect(base.p10).toBeGreaterThanOrEqual(8.5);
    expect(base.p90).toBeLessThanOrEqual(10.5);
  });

  it("shows pump P-02 at about 3% duty normally and about 38% after 01:40", () => {
    const pc = ch("kendall-street-tower/PC-02", "duty");
    expect(sample(pc, aedt(20, 1, 0), engine.world.effects)).toBeLessThanOrEqual(6);
    expect(sample(pc, aedt(20, 3, 0), engine.world.effects)).toBeGreaterThanOrEqual(35);
  });

  it("has minute readings that are noisy, not flat and not on exact minutes", () => {
    const ft = ch("kendall-street-tower/FT-01", "flow");
    const values = new Set<number>();
    for (let i = 0; i < 60; i++) values.add(sample(ft, aedt(20, 2, 0) + i * MINUTE, engine.world.effects)!);
    expect(values.size).toBeGreaterThan(10);
    const u = lastUplink("kendall-street-tower/FT-01", DEMO_START, engine.world.effects)!;
    expect(u % MINUTE).not.toBe(0);
  });
});

describe("everything else at 07:48", () => {
  it("computes the briefing: one critical not acknowledged, 3 warnings, 2 offline, 4 muted", () => {
    const rows = allBuildingRows(engine, DEMO_START);
    const br = briefing(engine, rows, DEMO_START, "Australia/Sydney");
    expect(br.critical).toHaveLength(1);
    expect(br.critical[0]).toMatchObject({ buildingId: "kendall-street-tower", acknowledged: false });
    expect(formatDuration(br.critical[0]!.criticalForMs)).toBe("3 h 36 min");
    expect(br.warnings).toBe(3);
    expect(br.offline).toBe(2);
    expect(br.muted).toBe(4);
    expect(br.weekday).toBe("Friday");
  });

  it("has Riverbend FT-04 silent for 3 d 4 h and Hay Street PT-03 for 2 h 10 min", () => {
    const fx = engine.world.effects;
    expect(formatDuration(DEMO_START - lastUplink("riverbend-plaza/FT-04", DEMO_START, fx)!)).toBe("3 d 4 h");
    expect(formatDuration(DEMO_START - lastUplink("hay-street-exchange/PT-03", DEMO_START, fx)!)).toBe("2 h 10 min");
  });

  it("reads 142 kPa on Level 21 at Wexford, 7.8 °C in Wattle Grove cool room 2, 31% in Parkside tank 2", () => {
    const fx = engine.world.effects;
    expect(sample(ch("140-wexford-street/PT-04", "pressure"), DEMO_START, fx)).toBe(142);
    expect(sample(ch("wattle-grove/TT-06", "temperature"), DEMO_START, fx)).toBe(7.8);
    expect(sample(ch("parkside-secondary/LT-02", "level"), DEMO_START, fx)).toBe(31);
  });

  it("acknowledged Wattle Grove at 06:27 AEST, Parkside two days ago", () => {
    const w = engine.world.incidents.find((i) => i.buildingId === "wattle-grove" && i.state !== "resolved")!;
    expect(formatTimeZoned(w.acknowledgedAt!, "Australia/Brisbane")).toBe("06:27 AEST");
    const p = engine.world.incidents.find((i) => i.buildingId === "parkside-secondary" && i.state !== "resolved")!;
    expect(Math.round((DEMO_START - p.acknowledgedAt!) / DAY)).toBe(2);
  });

  it("closed the Quay Street false alarm at 06:05 AEST", () => {
    const q = engine.world.incidents.find((i) => i.buildingId === "quay-street-offices" && i.category === "leak-false-alarm")!;
    expect(q.resolution).toBe("false-alarm");
    expect(formatTimeZoned(q.resolvedAt!, "Australia/Brisbane")).toBe("06:05 AEST");
  });

  it("has at least three data gaps and one stuck sensor", () => {
    const gaps = engine.world.effects.list().filter((e) => e.kind === "gap");
    expect(gaps.length).toBeGreaterThanOrEqual(3);
    expect(engine.world.effects.list().some((e) => e.kind === "stuck" && e.to! - e.from === 6 * HOUR)).toBe(true);
  });

  it("includes the Marden Square gateway reboot, 02:10 to 02:34 AEDT on Tue 17 Nov", () => {
    const g = engine.world.effects.list().find((e) => e.kind === "gap" && e.deviceIds.includes("marden-square/GW-02"))!;
    expect(formatTimeZoned(g.from, "Australia/Sydney")).toBe("02:10 AEDT");
    expect(formatTimeZoned(g.to!, "Australia/Sydney")).toBe("02:34 AEDT");
  });
});

describe("the hero loop", () => {
  it("plays from acknowledge to resolve and writes the Logbook at each step", () => {
    const e = new Engine();
    const logCount = () => e.world.logbook.length;
    const h = () => e.world.incidents.find((i) => i.id === "I-2026-0167")!;

    // 1. Unattended, the escalation repeats at 08:12
    e.advanceTo(DEMO_START + 25 * MINUTE);
    expect(escalationSummary(h(), e.world.notifications).steps).toBe(13);

    // 2. Acknowledge as Helen: escalation stops
    let before = logCount();
    e.apply({ type: "acknowledge", incidentId: "I-2026-0167", by: "helen" });
    expect(h().state).toBe("acknowledged");
    expect(logCount()).toBe(before + 1);
    e.advanceTo(DEMO_START + 90 * MINUTE);
    expect(escalationSummary(h(), e.world.notifications).steps).toBe(13);

    // 3. Fix Marcus's number and send a test message, which delivers
    e.apply({ type: "update-contact", personId: "marcus", mobileMasked: "0433 ••• 418", by: "helen" });
    e.apply({ type: "test-message", personId: "marcus", by: "helen" });
    expect(e.world.notifications[e.world.notifications.length - 1]!.result).toBe("delivered");

    // 4. Dispatch Tom, ETA 25 min; he arrives
    e.apply({ type: "dispatch", incidentId: "I-2026-0167", to: "tom", etaMin: 25, by: "helen" });
    e.advanceTo(e.now + 26 * MINUTE);
    expect(e.world.logbook.some((l) => l.action === "arrived" && l.actor === "tom")).toBe(true);

    // 5. Close XV-01: booster supply to Levels 7 to 18 (84 apartments); leak stops; booster alerts muted
    before = logCount();
    e.apply({ type: "close-valve", buildingId: "kendall-street-tower", valveTag: "XV-01", incidentId: "I-2026-0167", by: "tom" });
    const closed = e.world.logbook.find((l) => l.action === "valve-closed")!;
    expect(closed.detail).toContain("Levels 7 to 18 (12 levels, 84 apartments)");
    expect(e.world.logbook.some((l) => l.action === "auto-muted")).toBe(true);
    expect(logCount()).toBeGreaterThan(before);
    const lossAtClose = waterLostL(h(), e.now)!;
    e.advanceTo(e.now + 5 * MINUTE);
    expect(waterLostL(h(), e.now)).toBe(lossAtClose);
    expect(sample(ch("kendall-street-tower/PT-01", "pressure"), e.now, e.world.effects)).toBeLessThan(10);

    // 6. Resolve is refused while WL-B2-03 is wet, accepted once it dries (about 40 min)
    expect(() => e.apply({ type: "resolve", incidentId: "I-2026-0167", cause: "Mechanical seal failure on pump P-02", action: "Seal replaced", by: "helen" })).toThrow(/still reads wet/);
    e.advanceTo(e.now + 40 * MINUTE);
    e.apply({ type: "resolve", incidentId: "I-2026-0167", cause: "Mechanical seal failure on pump P-02", action: "Seal replaced", by: "helen" });
    expect(h().state).toBe("resolved");
    expect(e.world.logbook[e.world.logbook.length - 1]!.action).toBe("resolved");
  });

  it("replays a session exactly from its commands", () => {
    const a = new Engine();
    a.advanceTo(DEMO_START + 10 * MINUTE);
    a.apply({ type: "acknowledge", incidentId: "I-2026-0167", by: "helen" });
    a.advanceTo(DEMO_START + 30 * MINUTE);
    const b = new Engine();
    for (const c of a.commands) {
      b.advanceTo(c.at);
      b.apply(c.cmd);
    }
    b.advanceTo(DEMO_START + 30 * MINUTE);
    expect(b.world.logbook.map((l) => l.detail)).toEqual(a.world.logbook.map((l) => l.detail));
  });
});

describe("demo triggers", () => {
  it("burst at Wexford goes critical within two minutes and Priya acknowledges", () => {
    const e = new Engine();
    e.apply({ type: "trigger", scenario: "burst", by: "helen" });
    const t0 = e.now;
    e.advanceTo(t0 + 3 * MINUTE);
    const inc = e.world.incidents.find((i) => i.buildingId === "140-wexford-street" && i.state !== "resolved" && i.severity === "critical");
    expect(inc).toBeDefined();
    expect(inc!.severitySince - t0).toBeLessThanOrEqual(3 * MINUTE);
    e.advanceTo(t0 + 10 * MINUTE);
    expect(inc!.acknowledgedBy).toBe("priya");
  });

  it("gateway GW-04 offline pauses nine devices and opens an incident", () => {
    const e = new Engine();
    e.apply({ type: "trigger", scenario: "gateway", by: "helen" });
    e.advanceTo(e.now + 16 * MINUTE);
    expect(fleetExceptions(e, e.now).paused).toHaveLength(9);
    expect(e.world.incidents.some((i) => i.buildingId === "ellery-house-hotel" && i.category === "gateway-offline" && i.state === "open")).toBe(true);
  });
});
