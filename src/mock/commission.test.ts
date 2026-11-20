import { describe, expect, it } from "vitest";
import { Engine } from "@/mock/engine/engine";
import { allDevices, nextTag } from "@/mock/world/topology";
import { sample } from "@/mock/signals/signals";

describe("commissioning", () => {
  it("adds a device that reports, and a reset removes it", () => {
    const e = new Engine();
    const tag = nextTag("kendall-street-tower", "leak-sensor", "B2");
    expect(tag).toBe("WL-B2-05");
    e.apply({ type: "commission-device", buildingId: "kendall-street-tower", tag, kind: "leak-sensor", levelId: "kendall-street-tower/B2", systemId: null, location: "Booster pump room, under P-02", devEui: "70B3D5E7FFFF0001", photo: null, by: "kayla" });
    expect(allDevices()).toHaveLength(414);
    const d = allDevices().find((x) => x.tag === tag)!;
    expect(sample(d.channels[0]!, e.now, e.world.effects)).toBe(0);
    expect(e.world.logbook[e.world.logbook.length - 1]!.action).toBe("device-commissioned");
    expect(() => e.apply({ type: "commission-device", buildingId: "kendall-street-tower", tag: "WL-B2-06", kind: "leak-sensor", levelId: "kendall-street-tower/B2", systemId: null, location: "x", devEui: "70B3D5E7FFFF0001", photo: null, by: "kayla" })).toThrow(/already registered/);
    e.reset();
    expect(allDevices()).toHaveLength(413);
  });
});
