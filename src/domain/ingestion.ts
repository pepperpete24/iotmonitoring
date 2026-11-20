/**
 * Generic ingestion layer: devices, their channels, readings and gateways.
 * Knows nothing about buildings or water. A cold-chain or energy module
 * reuses this layer unchanged.
 */
import type { UtcMs } from "./common";

export type LinkType = "LoRaWAN" | "Cellular";
export type DeviceState = "online" | "offline" | "muted";

export type DeviceKind =
  | "flow-meter"
  | "pressure-sensor"
  | "tank-level"
  | "pump-monitor"
  | "leak-sensor"
  | "temperature-probe"
  | "door-contact"
  | "valve-controller"
  | "gateway";

export const DEVICE_KIND_LABEL: Record<DeviceKind, string> = {
  "flow-meter": "Flow meter",
  "pressure-sensor": "Pressure sensor",
  "tank-level": "Tank level sensor",
  "pump-monitor": "Pump current monitor",
  "leak-sensor": "Leak sensor",
  "temperature-probe": "Temperature probe",
  "door-contact": "Door contact",
  "valve-controller": "Isolation valve controller",
  gateway: "Gateway",
};

/** Hardware is not chosen: models are generic placeholders. */
export const PLACEHOLDER_MODEL: Record<DeviceKind, string> = {
  "flow-meter": "LoRaWAN pulse flow meter interface",
  "pressure-sensor": "LoRaWAN pressure transmitter, 0 to 1,600 kPa",
  "tank-level": "LoRaWAN ultrasonic level sensor",
  "pump-monitor": "LoRaWAN current clamp, 0 to 50 A",
  "leak-sensor": "LoRaWAN leak sensor",
  "temperature-probe": "LoRaWAN temperature probe",
  "door-contact": "LoRaWAN door contact",
  "valve-controller": "LoRaWAN valve actuator controller",
  gateway: "LoRaWAN indoor gateway",
};

export type Measure =
  | "flow" // L/min
  | "pressure" // kPa
  | "level" // %
  | "temperature" // °C
  | "current" // A
  | "duty" // %
  | "wet" // 0 dry, 1 wet
  | "door" // 0 closed, 1 open
  | "valve"; // 0 open, 1 closed

export const MEASURE_UNIT: Record<Measure, string> = {
  flow: "L/min",
  pressure: "kPa",
  level: "%",
  temperature: "°C",
  current: "A",
  duty: "%",
  wet: "",
  door: "",
  valve: "",
};

export interface Channel {
  id: string; // `${deviceId}/${measure}`
  deviceId: string;
  measure: Measure;
  /** Seconds between samples. */
  intervalS: number;
  /** Resolution the device reports at. */
  resolution: number;
}

export interface Device {
  id: string; // building-scoped tag made globally unique: `${buildingId}/${tag}`
  tag: string; // FT-01
  kind: DeviceKind;
  model: string;
  devEui: string; // 16 hex digits, unique
  firmware: string;
  /** Battery % at the demo start, one decimal, unique across the fleet. */
  batteryAtStart: number;
  /** Battery drain in points per day. */
  batteryDrainPerDay: number;
  rssi: number; // dBm, typical
  snr: number; // dB, typical
  link: LinkType;
  gatewayId: string | null;
  installer: string;
  installedAt: UtcMs;
  calibratedAt: UtcMs | null;
  /** Uplink cadence in seconds (heartbeat for event devices). */
  uplinkS: number;
  /** Fraction of uplinks missing, 0 to 0.03. */
  lossRate: number;
  channels: Channel[];
  // module-layer placement, kept as plain references so the layer stays generic
  buildingId: string;
  levelId: string;
  systemId: string | null;
  equipmentId: string | null;
  location: string;
}

export interface Reading {
  channelId: string;
  t: UtcMs;
  value: number;
  quality: "good" | "stuck" | "estimated";
}

/** A span with no data for a device, for example a gateway reboot or flat battery. */
export interface DataGap {
  deviceIds: string[];
  from: UtcMs;
  to: UtcMs | null; // null: still missing
  reason: string;
}
