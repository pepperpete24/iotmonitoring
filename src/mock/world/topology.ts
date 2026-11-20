/**
 * Building topology: levels, systems, equipment and devices.
 *
 * Kendall Street Tower is specified device by device. The other buildings are
 * generated from their type profile plus the devices their story needs, then
 * topped up with leak sensors in the places a hydraulic contractor would put
 * them, until the device count matches the brief exactly.
 */
import type { Equipment, EquipmentKind, Level, System, SystemType } from "@/domain/building";
import { type Channel, type Device, type DeviceKind, type Measure, PLACEHOLDER_MODEL } from "@/domain/ingestion";
import { DAY } from "@/lib/format";
import { hashString, mulberry32, WORLD_SEED } from "@/mock/seed";
import { BUILDINGS, type BuildingProfile } from "./buildings";

// ---------------------------------------------------------------------------
// Specs

interface DeviceSpec {
  tag: string;
  kind: DeviceKind;
  level: string; // level short label: B3, G, L12, RF
  system: string | null; // system key
  equipment?: string; // equipment tag
  location: string;
  gateway?: string; // force a gateway tag
}

interface SystemSpec {
  key: string;
  name: string;
  type: SystemType;
  from: string;
  to: string;
  lane: number;
}

interface EquipmentSpec {
  tag: string;
  name: string;
  kind: EquipmentKind;
  level: string;
  system: string;
}

interface BuildingSpec {
  levels: Array<{ short: string; label: string; heightM: number }>;
  systems: SystemSpec[];
  equipment: EquipmentSpec[];
  devices: DeviceSpec[];
}

// ---------------------------------------------------------------------------
// Levels

function levelsFor(b: BuildingProfile): BuildingSpec["levels"] {
  if (b.campusBuildings) {
    // A campus is drawn as a row per building, not a vertical section.
    const out = [{ short: "SITE", label: "Grounds", heightM: 0 }];
    for (let i = 0; i < b.campusBuildings; i++) {
      const letter = String.fromCharCode(65 + i);
      out.push({ short: `BLD-${letter}`, label: `Building ${letter}`, heightM: (i + 1) * 4 });
    }
    return out;
  }
  const floor = b.type === "office" || b.type === "shopping-centre" || b.type === "healthcare" ? 3.8 : 3.1;
  const out: BuildingSpec["levels"] = [];
  for (let i = b.basements; i >= 1; i--) out.push({ short: `B${i}`, label: `B${i}`, heightM: -3.4 * i });
  out.push({ short: "G", label: "Ground", heightM: 0 });
  // `levels` counts storeys above ground including Ground for low buildings,
  // and residential levels above Ground for towers of 7 or more.
  const top = b.levels >= 7 ? b.levels : b.levels - 1;
  for (let i = 1; i <= top; i++) out.push({ short: `L${i}`, label: `Level ${i}`, heightM: i * floor });
  out.push({ short: "RF", label: "Roof", heightM: (top + 1) * floor });
  return out;
}

const topShort = (b: BuildingProfile) => (b.levels >= 7 ? `L${b.levels}` : b.levels > 1 ? `L${b.levels - 1}` : "G");
const lowShort = (b: BuildingProfile) => (b.basements ? `B${b.basements}` : "G");

// ---------------------------------------------------------------------------
// Kendall Street Tower, by hand

function kendallSpec(b: BuildingProfile): BuildingSpec {
  return {
    levels: levelsFor(b),
    systems: [
      { key: "cw", name: "Cold water riser A", type: "cold-water", from: "B3", to: "L6", lane: 0 },
      { key: "bst", name: "Booster riser B", type: "booster", from: "L7", to: "L18", lane: 1 },
      { key: "hw", name: "Hot water flow and return", type: "hot-water", from: "L1", to: "RF", lane: 2 },
      { key: "fire", name: "Fire water storage", type: "fire-tank", from: "B3", to: "B3", lane: 3 },
      { key: "net", name: "Gateways", type: "network", from: "B3", to: "RF", lane: 4 },
    ],
    equipment: [
      { tag: "M-01", name: "Main water meter", kind: "meter", level: "B3", system: "cw" },
      { tag: "BS-01", name: "Booster set", kind: "booster-set", level: "B2", system: "bst" },
      { tag: "P-01", name: "Booster pump P-01", kind: "pump", level: "B2", system: "bst" },
      { tag: "P-02", name: "Booster pump P-02", kind: "pump", level: "B2", system: "bst" },
      { tag: "XV-01", name: "Booster supply isolation valve", kind: "isolation-valve", level: "B2", system: "bst" },
      { tag: "M-02", name: "Booster discharge meter", kind: "meter", level: "B2", system: "bst" },
      { tag: "TK-01", name: "Roof tank", kind: "tank", level: "RF", system: "bst" },
      { tag: "TK-02", name: "Fire water tank", kind: "tank", level: "B3", system: "fire" },
      { tag: "HWU-01", name: "Central hot water plant", kind: "hot-water-unit", level: "RF", system: "hw" },
      { tag: "P-03", name: "Hot water circulating pump", kind: "pump", level: "RF", system: "hw" },
    ],
    devices: [
      { tag: "FT-01", kind: "flow-meter", level: "B3", system: "cw", equipment: "M-01", location: "B3 meter room, main incoming" },
      { tag: "FT-02", kind: "flow-meter", level: "B2", system: "bst", equipment: "M-02", location: "B2 booster discharge" },
      { tag: "FT-03", kind: "flow-meter", level: "RF", system: "hw", equipment: "HWU-01", location: "Roof plant, hot water make-up" },
      { tag: "PT-01", kind: "pressure-sensor", level: "B2", system: "bst", location: "B2 booster discharge" },
      { tag: "PT-02", kind: "pressure-sensor", level: "G", system: "cw", location: "Ground, riser A" },
      { tag: "PT-03", kind: "pressure-sensor", level: "L6", system: "cw", location: "Level 6, riser A" },
      { tag: "PT-04", kind: "pressure-sensor", level: "L12", system: "bst", location: "Level 12, riser B" },
      { tag: "PT-05", kind: "pressure-sensor", level: "L18", system: "bst", location: "Level 18, riser B" },
      { tag: "LT-01", kind: "tank-level", level: "RF", system: "bst", equipment: "TK-01", location: "Roof tank" },
      { tag: "LT-02", kind: "tank-level", level: "B3", system: "fire", equipment: "TK-02", location: "B3 fire water tank" },
      { tag: "PC-01", kind: "pump-monitor", level: "B2", system: "bst", equipment: "P-01", location: "B2 booster set, pump P-01" },
      { tag: "PC-02", kind: "pump-monitor", level: "B2", system: "bst", equipment: "P-02", location: "B2 booster set, pump P-02" },
      { tag: "PC-03", kind: "pump-monitor", level: "RF", system: "hw", equipment: "P-03", location: "Roof plant, hot water circulating pump" },
      { tag: "XV-01", kind: "valve-controller", level: "B2", system: "bst", equipment: "XV-01", location: "B2 booster supply" },
      { tag: "TT-01", kind: "temperature-probe", level: "RF", system: "hw", equipment: "HWU-01", location: "Roof plant, hot water return" },
      { tag: "TT-02", kind: "temperature-probe", level: "L9", system: "hw", location: "Level 9, hot water return" },
      { tag: "TT-03", kind: "temperature-probe", level: "B2", system: "bst", location: "B2 booster pump room, air" },
      { tag: "GW-01", kind: "gateway", level: "B3", system: "net", location: "B3 communications room" },
      { tag: "GW-02", kind: "gateway", level: "L9", system: "net", location: "Level 9 riser cupboard" },
      { tag: "GW-03", kind: "gateway", level: "RF", system: "net", location: "Roof plant room" },
      { tag: "WL-B3-01", kind: "leak-sensor", level: "B3", system: "cw", location: "B3 meter room floor" },
      { tag: "WL-B3-02", kind: "leak-sensor", level: "B3", system: "fire", location: "B3 fire tank bund" },
      { tag: "WL-B3-03", kind: "leak-sensor", level: "B3", system: null, location: "B3 lift pit" },
      { tag: "WL-B2-01", kind: "leak-sensor", level: "B2", system: "bst", location: "B2 booster pump room, entry" },
      { tag: "WL-B2-02", kind: "leak-sensor", level: "B2", system: "bst", location: "B2 booster pump room, P-01 plinth" },
      { tag: "WL-B2-03", kind: "leak-sensor", level: "B2", system: "bst", location: "B2 booster pump room floor" },
      { tag: "WL-B2-04", kind: "leak-sensor", level: "B2", system: null, location: "B2 car park sump" },
      { tag: "WL-B1-01", kind: "leak-sensor", level: "B1", system: null, location: "B1 bin room" },
      { tag: "WL-B1-02", kind: "leak-sensor", level: "B1", system: null, location: "B1 lift pit" },
      { tag: "WL-G-01", kind: "leak-sensor", level: "G", system: "cw", location: "Ground, retail tenancy 2 ceiling" },
      { tag: "WL-L1-01", kind: "leak-sensor", level: "L1", system: "hw", location: "Level 1 riser cupboard" },
      { tag: "WL-L6-01", kind: "leak-sensor", level: "L6", system: "cw", location: "Level 6 riser cupboard" },
      { tag: "WL-L7-01", kind: "leak-sensor", level: "L7", system: "bst", location: "Level 7 riser cupboard" },
      { tag: "WL-L12-01", kind: "leak-sensor", level: "L12", system: "bst", location: "Level 12 riser cupboard" },
      { tag: "WL-L18-01", kind: "leak-sensor", level: "L18", system: "bst", location: "Level 18 riser cupboard" },
      { tag: "WL-RF-01", kind: "leak-sensor", level: "RF", system: "hw", location: "Roof plant room floor" },
      { tag: "WL-RF-02", kind: "leak-sensor", level: "RF", system: "bst", location: "Roof tank bund" },
      { tag: "WL-RF-03", kind: "leak-sensor", level: "RF", system: "hw", location: "Roof plant, hot water unit tray" },
    ],
  };
}

// ---------------------------------------------------------------------------
// Generated buildings

/** Devices each building's story needs, beyond its type profile. */
const STORY_DEVICES: Record<string, (b: BuildingProfile) => DeviceSpec[]> = {
  "ellery-house-hotel": () => [
    { tag: "WL-L3-01", kind: "leak-sensor", level: "L3", system: "cw", location: "Level 3 linen room" },
  ],
  "glenelg-health-hub": () => [
    { tag: "WL-L1-01", kind: "leak-sensor", level: "L1", system: "cw", location: "Level 1 consulting suite 3, sink cupboard" },
    { tag: "WL-L1-02", kind: "leak-sensor", level: "L1", system: "cw", location: "Level 1 treatment room, sterilising bay" },
    { tag: "WL-L1-03", kind: "leak-sensor", level: "L1", system: "hw", location: "Level 1 riser cupboard" },
  ],
  "quay-street-offices": () => [
    { tag: "WL-G-02", kind: "leak-sensor", level: "G", system: "cw", location: "Ground, lobby amenities" },
  ],
};

function genericSpec(b: BuildingProfile): BuildingSpec {
  const levels = levelsFor(b);
  const shorts = levels.map((l) => l.short);
  const top = b.campusBuildings ? shorts[shorts.length - 1]! : topShort(b);
  const low = b.campusBuildings ? "SITE" : lowShort(b);
  const tall = !b.campusBuildings && b.levels >= 7;
  const systems: SystemSpec[] = [];
  const equipment: EquipmentSpec[] = [];
  const devices: DeviceSpec[] = [];
  const counters = new Map<string, number>();
  const next = (prefix: string) => {
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    return `${prefix}-${String(n).padStart(2, "0")}`;
  };
  const lvlLabel = (s: string) => levels.find((l) => l.short === s)?.label ?? s;

  // Cold water and boosting
  const mainsTop = tall ? "L6" : top;
  systems.push({ key: "cw", name: "Cold water riser A", type: "cold-water", from: low, to: mainsTop, lane: 0 });
  equipment.push({ tag: "M-01", name: "Main water meter", kind: "meter", level: low, system: "cw" });
  devices.push({ tag: next("FT"), kind: "flow-meter", level: low, system: "cw", equipment: "M-01", location: `${lvlLabel(low)} meter room, main incoming` });

  if (tall) {
    systems.push({ key: "bst", name: "Booster riser B", type: "booster", from: "L7", to: top, lane: 1 });
    equipment.push(
      { tag: "BS-01", name: "Booster set", kind: "booster-set", level: low, system: "bst" },
      { tag: "P-01", name: "Booster pump P-01", kind: "pump", level: low, system: "bst" },
      { tag: "P-02", name: "Booster pump P-02", kind: "pump", level: low, system: "bst" },
    );
    devices.push({ tag: next("PT"), kind: "pressure-sensor", level: low, system: "bst", location: `${lvlLabel(low)} booster discharge` });
    devices.push({ tag: next("PC"), kind: "pump-monitor", level: low, system: "bst", equipment: "P-01", location: `${lvlLabel(low)} booster set, pump P-01` });
    devices.push({ tag: next("PC"), kind: "pump-monitor", level: low, system: "bst", equipment: "P-02", location: `${lvlLabel(low)} booster set, pump P-02` });
    // a pressure sensor near the top of each pressure zone (about 7 levels each)
    const zoneTops: number[] = [];
    for (let l = Math.min(b.levels, 7); l <= b.levels; l += 7) zoneTops.push(l);
    if (zoneTops[zoneTops.length - 1] !== b.levels) zoneTops.push(b.levels);
    for (const l of zoneTops) devices.push({ tag: next("PT"), kind: "pressure-sensor", level: `L${l}`, system: "bst", location: `Level ${l}, riser B` });
    if (zoneTops.length > 2) {
      const prvLevel = `L${zoneTops[0]! + 1}`;
      equipment.push({ tag: "PRV-01", name: "Pressure-reducing valve", kind: "prv", level: prvLevel, system: "bst" });
    }
    equipment.push({ tag: "TK-01", name: "Roof tank", kind: "tank", level: "RF", system: "bst" });
    devices.push({ tag: next("LT"), kind: "tank-level", level: "RF", system: "bst", equipment: "TK-01", location: "Roof tank" });
    systems.push({ key: "fire", name: "Fire water storage", type: "fire-tank", from: low, to: low, lane: 3 });
    equipment.push({ tag: "TK-02", name: "Fire water tank", kind: "tank", level: low, system: "fire" });
    devices.push({ tag: next("LT"), kind: "tank-level", level: low, system: "fire", equipment: "TK-02", location: `${lvlLabel(low)} fire water tank` });
  } else if (!b.campusBuildings) {
    devices.push({ tag: next("PT"), kind: "pressure-sensor", level: low, system: "cw", location: `${lvlLabel(low)}, incoming main` });
    devices.push({ tag: next("PT"), kind: "pressure-sensor", level: top, system: "cw", location: `${lvlLabel(top)}, riser A` });
  }

  if (b.hasShutoffValve) {
    const sys = tall ? "bst" : "cw";
    equipment.push({ tag: "XV-01", name: "Isolation valve", kind: "isolation-valve", level: low, system: sys });
    devices.push({ tag: "XV-01", kind: "valve-controller", level: low, system: sys, equipment: "XV-01", location: `${lvlLabel(low)} ${tall ? "booster supply" : "main supply"}` });
  }

  // Sub-meters
  if (b.type === "hotel") {
    for (const wing of ["North wing", "South wing"]) {
      const tag = next("FT");
      equipment.push({ tag: `M-${tag.slice(3)}`, name: `${wing} sub-meter`, kind: "meter", level: "G", system: "cw" });
      devices.push({ tag, kind: "flow-meter", level: "G", system: "cw", equipment: `M-${tag.slice(3)}`, location: `Ground, ${wing.toLowerCase()} sub-meter` });
    }
  }
  if (b.type === "shopping-centre") {
    for (const area of ["Food court", "Amenities", "Tenancy main"]) {
      const tag = next("FT");
      equipment.push({ tag: `M-${tag.slice(3)}`, name: `${area} sub-meter`, kind: "meter", level: "G", system: "cw" });
      devices.push({ tag, kind: "flow-meter", level: "G", system: "cw", equipment: `M-${tag.slice(3)}`, location: `Ground, ${area.toLowerCase()} sub-meter` });
    }
  }

  // Hot water
  const hwCount = { "aged-care": 4, hotel: 2, healthcare: 2, strata: 1, "holiday-apartments": 2, office: 1, school: 0, "shopping-centre": 0, retail: 1 }[b.type];
  if (hwCount > 0) {
    const plant = tall ? "RF" : "G";
    systems.push({ key: "hw", name: "Hot water flow and return", type: "hot-water", from: tall ? "L1" : "G", to: tall ? "RF" : top, lane: 2 });
    equipment.push({ tag: "HWU-01", name: "Hot water plant", kind: "hot-water-unit", level: plant, system: "hw" });
    const spots = [plant, top, tall ? `L${Math.ceil(b.levels / 2)}` : "G", shorts[Math.min(shorts.length - 2, 2)]!];
    for (let i = 0; i < hwCount; i++) {
      const lv = spots[i % spots.length]!;
      devices.push({ tag: next("TT"), kind: "temperature-probe", level: lv, system: "hw", equipment: i === 0 ? "HWU-01" : undefined, location: `${lvlLabel(lv)}, hot water return${i ? ` ${i + 1}` : ""}` });
    }
  }

  // Refrigeration
  const coolRooms = { hotel: 2, "aged-care": 2, school: 1, "shopping-centre": 3, healthcare: 0, strata: 0, "holiday-apartments": 0, office: 0, retail: 0 }[b.type];
  if (coolRooms > 0) {
    const crLevel = b.campusBuildings ? "BLD-C" : "G";
    systems.push({ key: "ref", name: "Cool rooms", type: "refrigeration", from: crLevel, to: crLevel, lane: 3 });
    const place = b.type === "shopping-centre" ? "Food court" : b.type === "school" ? "Canteen" : "Kitchen";
    for (let i = 1; i <= coolRooms; i++) {
      const crTag = `CR-0${i}`;
      equipment.push({ tag: crTag, name: `Cool room ${i}`, kind: "cool-room", level: crLevel, system: "ref" });
      devices.push({ tag: next("TT"), kind: "temperature-probe", level: crLevel, system: "ref", equipment: crTag, location: `${place}, cool room ${i}` });
      devices.push({ tag: next("DC"), kind: "door-contact", level: crLevel, system: "ref", equipment: crTag, location: `${place}, cool room ${i} door` });
    }
  }

  // Rainwater
  if (b.type === "school") {
    systems.push({ key: "rw", name: "Rainwater harvesting", type: "rainwater", from: "SITE", to: "SITE", lane: 1 });
    for (let i = 1; i <= 2; i++) {
      equipment.push({ tag: `TK-0${i}`, name: `Rainwater tank ${i}`, kind: "tank", level: "SITE", system: "rw" });
      devices.push({ tag: next("LT"), kind: "tank-level", level: "SITE", system: "rw", equipment: `TK-0${i}`, location: `Rainwater tank ${i}, ${i === 1 ? "Building A" : "Building C"}` });
    }
    equipment.push({ tag: "P-01", name: "Rainwater transfer pump", kind: "pump", level: "SITE", system: "rw" });
    devices.push({ tag: next("PC"), kind: "pump-monitor", level: "SITE", system: "rw", equipment: "P-01", location: "Rainwater transfer pump" });
    for (const s of shorts.slice(1)) {
      devices.push({ tag: next("FT"), kind: "flow-meter", level: s, system: "cw", location: `${lvlLabel(s)} sub-meter` });
    }
  }

  // Gateways
  const gwCount = b.id === "ellery-house-hotel" ? 4 : Math.max(1, Math.round(b.deviceCount / 13));
  systems.push({ key: "net", name: "Gateways", type: "network", from: low, to: b.campusBuildings ? top : "RF", lane: 4 });
  const gwLevels = b.campusBuildings
    ? shorts.filter((_, i) => i % 2 === 1)
    : [low, ...(gwCount > 2 ? [shorts[Math.floor(shorts.length / 2)]!] : []), ...(gwCount > 1 ? ["RF"] : []), ...(gwCount > 3 ? ["G"] : [])];
  for (let i = 0; i < gwCount; i++) {
    const lv = gwLevels[i % gwLevels.length]!;
    devices.push({ tag: next("GW"), kind: "gateway", level: lv, system: "net", location: `${lvlLabel(lv)} ${lv === "RF" ? "plant room" : "communications cupboard"}` });
  }

  // Story devices
  for (const d of STORY_DEVICES[b.id]?.(b) ?? []) devices.push(d);

  // Top up with leak sensors where water escapes first.
  const leakSpots: Array<[string, string]> = [];
  if (b.campusBuildings) {
    for (const s of shorts.slice(1)) leakSpots.push([s, `${lvlLabel(s)} plant room floor`], [s, `${lvlLabel(s)} amenities`]);
    leakSpots.push(["SITE", "Rainwater pump pit"]);
  } else {
    leakSpots.push([low, `${lvlLabel(low)} meter room floor`]);
    if (tall) leakSpots.push([low, `${lvlLabel(low)} booster pump room floor`], [low, `${lvlLabel(low)} fire tank bund`]);
    for (let i = 1; i <= b.basements; i++) leakSpots.push([`B${i}`, `B${i} lift pit`], [`B${i}`, `B${i} car park sump`]);
    leakSpots.push(["G", "Ground, kitchen or amenities"], ["RF", "Roof plant room floor"]);
    if (coolRooms) leakSpots.push(["G", "Cool room condensate tray"]);
    if (hwCount) leakSpots.push([tall ? "RF" : "G", "Hot water unit tray"]);
    const above = shorts.filter((s) => s.startsWith("L"));
    const step = Math.max(1, Math.floor(above.length / 8));
    for (let i = 0; i < above.length; i += step) leakSpots.push([above[i]!, `${lvlLabel(above[i]!)} riser cupboard`]);
    for (let i = Math.floor(step / 2); i < above.length; i += step) leakSpots.push([above[i]!, `${lvlLabel(above[i]!)} plant or cleaner's room`]);
  }
  const usedLeakSpots = new Set(devices.filter((d) => d.kind === "leak-sensor").map((d) => d.location));
  const leakCounters = new Map<string, number>();
  for (const d of devices) {
    if (d.kind !== "leak-sensor") continue;
    const m = /^WL-(.+)-(\d+)$/.exec(d.tag);
    if (m) leakCounters.set(m[1]!, Math.max(leakCounters.get(m[1]!) ?? 0, Number(m[2])));
  }
  const ORDINAL = ["", "second", "third", "fourth", "fifth", "sixth"];
  let spot = 0;
  while (devices.length < b.deviceCount) {
    if (spot > leakSpots.length * ORDINAL.length) throw new Error(`${b.name}: ran out of leak sensor locations`);
    const [lv, where] = leakSpots[spot % leakSpots.length]!;
    const round = Math.floor(spot / leakSpots.length);
    spot++;
    const label = round ? `${where}, ${ORDINAL[round]} sensor` : where;
    if (usedLeakSpots.has(label)) continue;
    usedLeakSpots.add(label);
    const key = lv.replace("BLD-", "");
    const n = (leakCounters.get(key) ?? 0) + 1;
    leakCounters.set(key, n);
    devices.push({ tag: `WL-${key}-${String(n).padStart(2, "0")}`, kind: "leak-sensor", level: lv, system: null, location: label });
  }
  if (devices.length > b.deviceCount) {
    throw new Error(`${b.name}: profile needs ${devices.length} devices but the brief allows ${b.deviceCount}`);
  }
  return { levels, systems, equipment, devices };
}

// ---------------------------------------------------------------------------
// Materialise

const CHANNELS: Record<DeviceKind, Array<{ measure: Measure; intervalS: number; resolution: number }>> = {
  "flow-meter": [{ measure: "flow", intervalS: 60, resolution: 0.1 }],
  "pressure-sensor": [{ measure: "pressure", intervalS: 60, resolution: 1 }],
  "tank-level": [{ measure: "level", intervalS: 300, resolution: 1 }],
  "pump-monitor": [
    { measure: "current", intervalS: 60, resolution: 0.1 },
    { measure: "duty", intervalS: 60, resolution: 1 },
  ],
  "leak-sensor": [{ measure: "wet", intervalS: 1800, resolution: 1 }],
  "temperature-probe": [{ measure: "temperature", intervalS: 300, resolution: 0.1 }],
  "door-contact": [{ measure: "door", intervalS: 1800, resolution: 1 }],
  "valve-controller": [{ measure: "valve", intervalS: 1800, resolution: 1 }],
  gateway: [],
};

const FIRMWARE: Record<DeviceKind, string> = {
  "flow-meter": "3.2.4",
  "pressure-sensor": "2.8.1",
  "tank-level": "1.6.0",
  "pump-monitor": "2.1.3",
  "leak-sensor": "4.0.2",
  "temperature-probe": "2.8.1",
  "door-contact": "4.0.2",
  "valve-controller": "1.4.7",
  gateway: "6.3.0",
};

/** Firmware one release behind, for the registry filter. */
export const FIRMWARE_LATEST = FIRMWARE;
const OLD_FIRMWARE = { buildingId: "norwood-parade-centre", tag: "WL-G-01", version: "3.7.9" };

export interface Topology {
  levels: Level[];
  systems: System[];
  equipment: Equipment[];
  devices: Device[];
}

const INSTALL_START = Date.UTC(2026, 5, 2); // Tue 2 Jun 2026

function materialise(b: BuildingProfile, spec: BuildingSpec, used: { euis: Set<string> }): Topology {
  const rand = mulberry32(WORLD_SEED ^ hashString(b.id));
  const levels: Level[] = spec.levels.map((l, i) => ({
    id: `${b.id}/${l.short}`,
    buildingId: b.id,
    label: l.label,
    short: l.short,
    heightM: l.heightM,
    order: i,
  }));
  const levelId = (s: string) => {
    const l = levels.find((x) => x.short === s);
    if (!l) throw new Error(`${b.name}: no level ${s}`);
    return l.id;
  };
  const systems: System[] = spec.systems.map((s) => ({
    id: `${b.id}/sys/${s.key}`,
    buildingId: b.id,
    name: s.name,
    type: s.type,
    servesFrom: levelId(s.from),
    servesTo: levelId(s.to),
    lane: s.lane,
  }));
  const sysId = (k: string | null) => (k ? `${b.id}/sys/${k}` : null);
  const equipment: Equipment[] = spec.equipment.map((e) => ({
    id: `${b.id}/eq/${e.tag}`,
    buildingId: b.id,
    tag: e.tag,
    name: e.name,
    kind: e.kind,
    levelId: levelId(e.level),
    systemId: sysId(e.system)!,
  }));

  // Gateways first, so devices can be assigned to the nearest by level.
  const gateways = spec.devices.filter((d) => d.kind === "gateway");
  const orderOf = (short: string) => spec.levels.findIndex((l) => l.short === short);

  // Ellery House: nine devices sit behind GW-04 for the gateway scenario.
  const forcedGw = new Map<string, string>();
  if (b.id === "ellery-house-hotel") {
    const candidates = spec.devices.filter((d) => d.kind !== "gateway" && d.level !== "B2" && d.level !== "B1");
    for (const d of candidates.slice(-9)) forcedGw.set(d.tag, "GW-04");
  }

  const installDay = Math.floor(rand() * 60);
  const devices: Device[] = spec.devices.map((d, i) => {
    let eui = "";
    do {
      eui = Array.from({ length: 16 }, () => "0123456789ABCDEF"[Math.floor(rand() * 16)]).join("");
    } while (used.euis.has(eui));
    used.euis.add(eui);
    let gatewayTag: string | null = null;
    if (d.kind !== "gateway" && gateways.length) {
      gatewayTag =
        forcedGw.get(d.tag) ??
        gateways
          .filter((g) => !(b.id === "ellery-house-hotel" && g.tag === "GW-04"))
          .reduce((best, g) =>
            Math.abs(orderOf(g.level) - orderOf(d.level)) < Math.abs(orderOf(best.level) - orderOf(d.level)) ? g : best,
          ).tag;
    }
    const id = `${b.id}/${d.tag}`;
    const channels: Channel[] = CHANNELS[d.kind].map((c) => ({
      id: `${id}/${c.measure}`,
      deviceId: id,
      measure: c.measure,
      intervalS: c.intervalS,
      resolution: c.resolution,
    }));
    const isInstrument = d.kind === "flow-meter" || d.kind === "pressure-sensor" || d.kind === "tank-level";
    const installedAt = INSTALL_START + (installDay + Math.floor(i / 6)) * DAY + Math.floor(rand() * 8 * 3600_000) + 7 * 3600_000 - 10 * 3600_000;
    return {
      id,
      tag: d.tag,
      kind: d.kind,
      model: PLACEHOLDER_MODEL[d.kind],
      devEui: eui,
      firmware: b.id === OLD_FIRMWARE.buildingId && d.tag === OLD_FIRMWARE.tag ? OLD_FIRMWARE.version : FIRMWARE[d.kind],
      batteryAtStart: 0, // assigned fleet-wide below so no two match
      batteryDrainPerDay: 0.03 + rand() * 0.03,
      rssi: Math.round(-62 - rand() * 44),
      snr: Math.round((10 - rand() * 16) * 10) / 10,
      link: d.kind === "gateway" ? "Cellular" : "LoRaWAN",
      gatewayId: gatewayTag ? `${b.id}/${gatewayTag}` : null,
      installer: "kayla",
      installedAt,
      calibratedAt: isInstrument ? installedAt - Math.floor(rand() * 40) * DAY : null,
      uplinkS: CHANNELS[d.kind][0]?.intervalS ?? 300,
      lossRate: rand() < 0.35 ? 0.01 + rand() * 0.02 : 0,
      channels,
      buildingId: b.id,
      levelId: levelId(d.level),
      systemId: sysId(d.system),
      equipmentId: d.equipment ? `${b.id}/eq/${d.equipment}` : null,
      location: d.location,
    };
  });
  return { levels, systems, equipment, devices };
}

// ---------------------------------------------------------------------------
// Fleet-wide adjustments: batteries, weak signal

/** Devices whose battery is low at the start (under 20%). FT-04 at Riverbend is flat. */
const LOW_BATTERY: Record<string, number> = {
  "riverbend-plaza/FT-04": 0,
  "marden-square/WL-B2-03": 11.4,
  "lorne-road-medical/TT-02": 14.7,
  "the-foundry/WL-B1-03": 17.2,
  "palmcrest-apartments/WL-B1-02": 18.6,
  "rosewood-gardens/DC-01": 19.3,
};

/** Weak signal: RSSI worse than -110 dBm. */
const WEAK_SIGNAL: Record<string, { rssi: number; snr: number }> = {
  "hay-street-exchange/PT-03": { rssi: -117, snr: -14.2 },
  "parkside-secondary/LT-02": { rssi: -113, snr: -9.8 },
  "palmcrest-apartments/PT-04": { rssi: -112, snr: -8.1 },
  "marden-square/WL-B2-02": { rssi: -114, snr: -11.6 },
  "wapping-lane/WL-B1-02": { rssi: -111, snr: -7.4 },
};

let cache: Map<string, Topology> | null = null;

export function allTopology(): Map<string, Topology> {
  if (cache) return cache;
  const used = { euis: new Set<string>() };
  const map = new Map<string, Topology>();
  for (const b of BUILDINGS) {
    const spec = b.id === "kendall-street-tower" ? kendallSpec(b) : genericSpec(b);
    map.set(b.id, materialise(b, spec, used));
  }

  // Unique battery levels, one decimal, 21.0 to 99.6, low ones fixed above.
  const rand = mulberry32(WORLD_SEED ^ 0xba77);
  const taken = new Set<number>(Object.values(LOW_BATTERY).map((v) => Math.round(v * 10)));
  const fleet = [...map.values()].flatMap((t) => t.devices);
  for (const d of fleet) {
    if (d.id in LOW_BATTERY) {
      d.batteryAtStart = LOW_BATTERY[d.id]!;
      continue;
    }
    if (d.kind === "gateway") {
      // mains powered with battery backup: report backup charge, still unique
    }
    let v: number;
    do {
      v = 210 + Math.floor(rand() * 786);
    } while (taken.has(v));
    taken.add(v);
    d.batteryAtStart = v / 10;
  }
  for (const d of fleet) {
    const w = WEAK_SIGNAL[d.id];
    if (w) {
      d.rssi = w.rssi;
      d.snr = w.snr;
    } else if (d.rssi < -108) {
      d.rssi = -96 - (Math.abs(hashString(d.id)) % 12);
    }
  }
  for (const id of [...Object.keys(LOW_BATTERY), ...Object.keys(WEAK_SIGNAL)]) {
    if (!fleet.some((d) => d.id === id)) throw new Error(`Story device ${id} does not exist in the generated fleet`);
  }
  cache = map;
  return map;
}

export function topologyOf(buildingId: string): Topology {
  const t = allTopology().get(buildingId);
  if (!t) throw new Error(`Unknown building ${buildingId}`);
  return t;
}

export function allDevices(): Device[] {
  return [...allTopology().values()].flatMap((t) => t.devices);
}

let deviceIndex: Map<string, Device> | null = null;
export function deviceById(id: string): Device | undefined {
  if (!deviceIndex) deviceIndex = new Map(allDevices().map((d) => [d.id, d]));
  return deviceIndex.get(id);
}

// ---- live changes: devices commissioned during the demo ------------------------

const listeners = new Set<() => void>();
/** Called when the fleet changes, so caches built from it can be dropped. */
export function onFleetChange(fn: () => void) {
  listeners.add(fn);
}

/** Add a newly commissioned device to its building. */
export function addDevice(d: Device) {
  const t = topologyOf(d.buildingId);
  if (t.devices.some((x) => x.id === d.id)) throw new Error(`${d.tag} already exists at this building`);
  t.devices.push(d);
  deviceIndex = null;
  for (const fn of listeners) fn();
}

/** Remove devices commissioned during the demo (reset). */
export function removeAddedDevices(ids: string[]) {
  if (!ids.length) return;
  for (const t of allTopology().values()) t.devices = t.devices.filter((d) => !ids.includes(d.id));
  deviceIndex = null;
  for (const fn of listeners) fn();
}

/** Build a device as an installer would commission it. */
export function makeDevice(args: {
  buildingId: string;
  tag: string;
  kind: DeviceKind;
  levelId: string;
  systemId: string | null;
  location: string;
  devEui: string;
  installer: string;
  at: number;
}): Device {
  const id = `${args.buildingId}/${args.tag}`;
  const t = topologyOf(args.buildingId);
  const gateway = t.devices.filter((d) => d.kind === "gateway").sort((a, z) => {
    const la = t.levels.find((l) => l.id === a.levelId)!.order;
    const lz = t.levels.find((l) => l.id === z.levelId)!.order;
    const target = t.levels.find((l) => l.id === args.levelId)!.order;
    return Math.abs(la - target) - Math.abs(lz - target);
  })[0];
  return {
    id,
    tag: args.tag,
    kind: args.kind,
    model: PLACEHOLDER_MODEL[args.kind],
    devEui: args.devEui,
    firmware: FIRMWARE[args.kind],
    batteryAtStart: 100,
    batteryDrainPerDay: 0.04,
    rssi: -94,
    snr: 6.5,
    link: args.kind === "gateway" ? "Cellular" : "LoRaWAN",
    gatewayId: gateway?.id ?? null,
    installer: args.installer,
    installedAt: args.at,
    calibratedAt: args.kind === "flow-meter" || args.kind === "pressure-sensor" || args.kind === "tank-level" ? args.at : null,
    uplinkS: CHANNELS[args.kind][0]?.intervalS ?? 300,
    lossRate: 0,
    channels: CHANNELS[args.kind].map((c) => ({ id: `${id}/${c.measure}`, deviceId: id, measure: c.measure, intervalS: c.intervalS, resolution: c.resolution })),
    buildingId: args.buildingId,
    levelId: args.levelId,
    systemId: args.systemId,
    equipmentId: null,
    location: args.location,
  };
}

/** The next free tag of a kind on a level, for example WL-B2-05. */
export function nextTag(buildingId: string, kind: DeviceKind, levelShort: string): string {
  const prefix: Record<DeviceKind, string> = {
    "flow-meter": "FT",
    "pressure-sensor": "PT",
    "tank-level": "LT",
    "pump-monitor": "PC",
    "leak-sensor": `WL-${levelShort}`,
    "temperature-probe": "TT",
    "door-contact": "DC",
    "valve-controller": "XV",
    gateway: "GW",
  };
  const p = prefix[kind];
  const used = topologyOf(buildingId).devices.map((d) => d.tag).filter((t) => t.startsWith(`${p}-`)).map((t) => Number(t.slice(p.length + 1)) || 0);
  return `${p}-${String(Math.max(0, ...used) + 1).padStart(2, "0")}`;
}
