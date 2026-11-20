/**
 * Incidents open at the demo start, Fri 20 Nov 2026 07:48 AEDT. Built by the
 * same machinery as the history, so they read the same everywhere.
 */
import type { HistorySpec } from "@/mock/history/specs";

const M = 60_000;

/** I-2026-0167: pump P-02 seal failing at Kendall Street Tower. All times AEDT. */
export const HERO: HistorySpec = {
  key: "hero",
  category: "burst",
  buildingId: "kendall-street-tower",
  at: [2026, 11, 20, 2, 10],
  severity: "warning",
  criticalAfterMin: 122, // 04:12
  title: "Leak",
  location: "B2 booster pump room",
  level: "B2",
  alerts: [
    { rule: "overnight-flow", device: "FT-01", afterMin: 0, value: 0, summary: "Overnight flow above baseline for 30 min" },
    { rule: "pump-runtime", device: "PC-02", afterMin: 15, value: 0, summary: "Pump P-02 duty above normal for 45 min" },
    { rule: "leak-wet", device: "WL-B2-03", afterMin: 122, value: 0, summary: "Leak sensor WL-B2-03 wet" },
  ],
  ack: null,
  openAtStart: true,
  effects: (o, d) => [
    // 01:40: the mechanical seal on P-02 begins to fail
    { kind: "leak", buildingId: "kendall-street-tower", meterTags: ["FT-01"], rateLpm: 6.2, rampMin: 1, from: o - 30 * M, to: null, note: "Pump P-02 mechanical seal" },
    { kind: "pump-duty", deviceId: d("PC-02"), duty: 38, rampMin: 20, from: o - 30 * M, to: null },
    // 04:12: water reaches the leak sensor on the pump room floor
    { kind: "wet", deviceId: d("WL-B2-03"), from: o + 122 * M, to: null },
  ],
  water: { rateLpm: 6.2, fromMin: -30, toMin: null, meter: "FT-01" },
};

/** Parkside: rainwater tank 2 fell below 40% on Sun 15 Nov; acknowledged Wed 18 Nov 08:03. */
export const PARKSIDE: HistorySpec = {
  key: "parkside-tank2",
  category: "tank",
  buildingId: "parkside-secondary",
  at: [2026, 11, 15, 12, 0], // replaced by the computed crossing time
  severity: "warning",
  title: "Rainwater tank 2 low",
  location: "Rainwater tank 2, Building C",
  level: "SITE",
  alerts: [{ rule: "tank-low", device: "LT-02", afterMin: 0, value: 0, summary: "Tank level below 40% for 15 min" }],
  ack: { afterMin: 0, by: "rhys" }, // replaced by the stated clock time
  openAtStart: true,
  notes: [{ afterMin: 0, by: "rhys", text: "Topping up from mains is not possible on this tank. Toilet flushing in Building C switches to mains automatically below 10%." }],
  effects: () => [],
};

/** Wattle Grove: cool room 2 door left open after a delivery. Times AEST. */
export const WATTLE: HistorySpec = {
  key: "wattle-cr2",
  category: "cool-room",
  buildingId: "wattle-grove",
  at: [2026, 11, 20, 6, 20],
  severity: "warning",
  title: "Cool room 2 above limit",
  location: "Kitchen, cool room 2",
  level: "G",
  alerts: [
    { rule: "door-open", device: "DC-02", afterMin: 0, value: 0, summary: "Cool room door open for 10 min" },
    { rule: "cool-room", device: "TT-06", afterMin: 1, value: 0, summary: "Cool room above 5 °C for 15 min" },
  ],
  ack: { afterMin: 7, by: "sandra" },
  openAtStart: true,
  effects: (o, d) => [{ kind: "door-open", doorId: d("DC-02"), probeId: d("TT-06"), from: o - 10 * M, to: null }],
};

/** 140 Wexford Street: third morning of low pressure on Level 21. Times AEDT. */
export const WEXFORD: HistorySpec = {
  key: "wexford-l21",
  category: "low-pressure",
  buildingId: "140-wexford-street",
  at: [2026, 11, 20, 7, 31],
  severity: "warning",
  title: "Low pressure",
  location: "Level 21",
  level: "L21",
  alerts: [{ rule: "low-pressure", device: "PT-04", afterMin: 0, value: 0, summary: "Pressure below 200 kPa" }],
  ack: null,
  openAtStart: true,
  // the size of the drop is set when the world is built, so Level 21 reads 142 kPa at 07:48
  effects: () => [],
};

export const OPEN_AT_START = [HERO, PARKSIDE, WATTLE, WEXFORD] as const;
