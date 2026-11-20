/**
 * Formatting helpers: numbers, units, A$, dates, times, zones and durations.
 * Australian English and formats throughout. All times are stored as UTC
 * milliseconds and rendered in an IANA zone.
 */

export type Unit =
  | "L/min"
  | "L"
  | "kL"
  | "kPa"
  | "%"
  | "°C"
  | "A"
  | "dBm"
  | "dB"
  | "m"
  | "min"
  | "A$/kL";

const numberFormats = new Map<string, Intl.NumberFormat>();
function nf(min: number, max: number): Intl.NumberFormat {
  const key = `${min}-${max}`;
  let f = numberFormats.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-AU", { minimumFractionDigits: min, maximumFractionDigits: max });
    numberFormats.set(key, f);
  }
  return f;
}

/** 2281.6 -> "2,281.6". Uses a true minus sign for negatives. */
export function formatNumber(value: number, decimals = 0): string {
  const s = nf(decimals, decimals).format(Math.abs(value) < 10 ** -(decimals + 1) ? 0 : value);
  return s.replace("-", "−");
}

/** Default precision per unit, so the same measure always reads the same way. */
export const unitDecimals: Record<Unit, number> = {
  "L/min": 1,
  L: 1,
  kL: 2,
  kPa: 0,
  "%": 0,
  "°C": 1,
  A: 1,
  dBm: 0,
  dB: 1,
  m: 1,
  min: 0,
  "A$/kL": 2,
};

/** Value and unit as separate strings, for the value-then-smaller-unit layout. */
export function valueParts(value: number, unit: Unit, decimals = unitDecimals[unit]) {
  return { value: formatNumber(value, decimals), unit };
}

/** "6.2 L/min" with a thin space, for prose and tooltips. */
export function formatValue(value: number, unit: Unit, decimals = unitDecimals[unit]): string {
  const sep = unit === "%" || unit === "°C" ? "" : " ";
  return `${formatNumber(value, decimals)}${sep}${unit}`;
}

/** A$7.99, A$1,850, A$31.25. Whole dollars drop cents unless `cents` is forced. */
export function formatAUD(value: number, opts: { cents?: boolean } = {}): string {
  const whole = Number.isInteger(value) && !opts.cents;
  const s = formatNumber(Math.abs(value), whole ? 0 : 2);
  return `${value < 0 ? "−" : ""}A$${s}`;
}

/** "A$650 to A$1,850" for pricing under test. */
export function formatAUDRange(min: number, max: number): string {
  return `${formatAUD(min)} to ${formatAUD(max)}`;
}

// ---- time zones -------------------------------------------------------------

export type AuZone =
  | "Australia/Sydney"
  | "Australia/Melbourne"
  | "Australia/Hobart"
  | "Australia/Brisbane"
  | "Australia/Adelaide"
  | "Australia/Perth";

/**
 * Abbreviation by UTC offset in minutes. Browsers disagree on short zone names
 * (some print GMT+11), so the abbreviation is derived from the offset instead.
 */
const ABBR_BY_OFFSET: Record<number, string> = {
  480: "AWST",
  570: "ACST",
  600: "AEST",
  630: "ACDT",
  660: "AEDT",
};

const offsetFormats = new Map<string, Intl.DateTimeFormat>();
/** UTC offset of `zone` at `utcMs`, in minutes. */
export function zoneOffsetMinutes(utcMs: number, zone: string): number {
  let f = offsetFormats.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-AU", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
    offsetFormats.set(zone, f);
  }
  const p = partsOf(f, utcMs);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const floored = Math.floor(utcMs / 60000) * 60000;
  return Math.round((asUtc - floored) / 60000);
}

export function zoneAbbr(utcMs: number, zone: string): string {
  const off = zoneOffsetMinutes(utcMs, zone);
  const abbr = ABBR_BY_OFFSET[off];
  if (abbr) return abbr;
  const sign = off < 0 ? "−" : "+";
  const a = Math.abs(off);
  return `UTC${sign}${Math.floor(a / 60)}${a % 60 ? `:${String(a % 60).padStart(2, "0")}` : ""}`;
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number };

function partsOf(f: Intl.DateTimeFormat, utcMs: number): Parts {
  const out: Record<string, number> = {};
  for (const part of f.formatToParts(new Date(utcMs))) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  return {
    year: out.year ?? 0,
    month: out.month ?? 1,
    day: out.day ?? 1,
    hour: (out.hour ?? 0) % 24,
    minute: out.minute ?? 0,
    second: out.second ?? 0,
    weekday: 0,
  };
}

/**
 * Offset cache keyed by zone and UTC hour. Every Australian zone changes
 * offset on an exact UTC hour, so one lookup per hour is exact.
 */
const offsetCache = new Map<string, number>();
export function cachedOffsetMinutes(utcMs: number, zone: string): number {
  const hourKey = `${zone}|${Math.floor(utcMs / 3_600_000)}`;
  let off = offsetCache.get(hourKey);
  if (off === undefined) {
    off = zoneOffsetMinutes(Math.floor(utcMs / 3_600_000) * 3_600_000, zone);
    if (offsetCache.size > 200_000) offsetCache.clear();
    offsetCache.set(hourKey, off);
  }
  return off;
}

/** Wall-clock parts of `utcMs` in `zone`. */
export function localParts(utcMs: number, zone: string): Parts {
  const d = new Date(utcMs + cachedOffsetMinutes(utcMs, zone) * 60_000);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
    weekday: d.getUTCDay(),
  };
}

/** Local hour of day as a fraction, 0 to 24. */
export function localHour(utcMs: number, zone: string): number {
  const ms = (utcMs + cachedOffsetMinutes(utcMs, zone) * 60_000) % 86_400_000;
  return (ms < 0 ? ms + 86_400_000 : ms) / 3_600_000;
}

/** UTC time of a local wall-clock moment in `zone`. */
export function fromLocal(zone: string, y: number, mo: number, d: number, h = 0, mi = 0): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const off1 = zoneOffsetMinutes(guess, zone);
  const t = guess - off1 * 60_000;
  const off2 = zoneOffsetMinutes(t, zone);
  return off2 === off1 ? t : guess - off2 * 60_000;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** "Fri 20 Nov 2026" */
export function formatDate(utcMs: number, zone: string, opts: { year?: boolean; weekday?: boolean } = {}): string {
  const p = localParts(utcMs, zone);
  const parts = [];
  if (opts.weekday !== false) parts.push(WEEKDAYS[p.weekday]);
  parts.push(String(p.day), MONTHS[p.month - 1]);
  if (opts.year !== false) parts.push(String(p.year));
  return parts.join(" ");
}

/** "07:48", or "07:48:12" with seconds. 24-hour clock. */
export function formatTime(utcMs: number, zone: string, opts: { seconds?: boolean } = {}): string {
  const p = localParts(utcMs, zone);
  return `${pad(p.hour)}:${pad(p.minute)}${opts.seconds ? `:${pad(p.second)}` : ""}`;
}

/** "07:48 AEDT" */
export function formatTimeZoned(utcMs: number, zone: string, opts: { seconds?: boolean } = {}): string {
  return `${formatTime(utcMs, zone, opts)} ${zoneAbbr(utcMs, zone)}`;
}

/** "Fri 20 Nov 2026, 07:48 AEDT" */
export function formatDateTime(utcMs: number, zone: string, opts: { seconds?: boolean; year?: boolean } = {}): string {
  return `${formatDate(utcMs, zone, { year: opts.year })}, ${formatTimeZoned(utcMs, zone, opts)}`;
}

/** ISO-like local stamp for CSV: "2026-11-20 07:48:12 AEDT" */
export function formatStamp(utcMs: number, zone: string): string {
  const p = localParts(utcMs, zone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)} ${zoneAbbr(utcMs, zone)}`;
}

// ---- durations --------------------------------------------------------------

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/**
 * Two most significant units, floored: "3 h 36 min", "3 d 4 h", "42 min", "45 s".
 * Under a minute shows seconds only when `seconds` is set, otherwise "under 1 min".
 */
export function formatDuration(ms: number, opts: { seconds?: boolean } = {}): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return h > 0 ? `${d} d ${h} h` : `${d} d`;
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  if (m > 0) return opts.seconds && m < 10 && s > 0 ? `${m} min ${s} s` : `${m} min`;
  return opts.seconds ? `${s} s` : "under 1 min";
}

/** "2 h 10 min ago" */
export function formatAgo(ms: number): string {
  return ms < MINUTE ? "just now" : `${formatDuration(ms)} ago`;
}

/** Count with the right noun: plural(3, "warning") -> "3 warnings". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}

/** Small numbers in words for briefing sentences: 1 -> "One". */
const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
export function countWord(n: number, capital = true): string {
  const w = n >= 0 && n < WORDS.length ? WORDS[n]! : formatNumber(n);
  return capital ? w : w.toLowerCase();
}
