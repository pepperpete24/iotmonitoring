import { describe, expect, it } from "vitest";
import {
  formatAUD,
  formatAUDRange,
  formatDate,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatTimeZoned,
  formatValue,
  zoneAbbr,
  HOUR,
  MINUTE,
  DAY,
} from "./format";

// Demo start: Fri 20 Nov 2026 07:48 AEDT
const START = Date.UTC(2026, 10, 19, 20, 48);

describe("numbers and units", () => {
  it("groups thousands and keeps units", () => {
    expect(formatNumber(2281.6, 1)).toBe("2,281.6");
    expect(formatValue(6.2, "L/min")).toBe("6.2 L/min");
    expect(formatValue(142, "kPa")).toBe("142 kPa");
    expect(formatValue(7.8, "°C")).toBe("7.8°C");
    expect(formatValue(2.2816, "kL")).toBe("2.28 kL");
  });
  it("uses a true minus sign", () => {
    expect(formatNumber(-117)).toBe("−117");
  });
  it("formats Australian dollars", () => {
    expect(formatAUD(7.99)).toBe("A$7.99");
    expect(formatAUD(1850)).toBe("A$1,850");
    expect(formatAUD(31.25)).toBe("A$31.25");
    expect(formatAUD(3.5, { cents: true })).toBe("A$3.50");
    expect(formatAUDRange(650, 1850)).toBe("A$650 to A$1,850");
  });
});

describe("time zones at the demo start", () => {
  it("renders each state's local time with its abbreviation", () => {
    expect(formatTimeZoned(START, "Australia/Sydney")).toBe("07:48 AEDT");
    expect(formatTimeZoned(START, "Australia/Melbourne")).toBe("07:48 AEDT");
    expect(formatTimeZoned(START, "Australia/Hobart")).toBe("07:48 AEDT");
    expect(formatTimeZoned(START, "Australia/Brisbane")).toBe("06:48 AEST");
    expect(formatTimeZoned(START, "Australia/Adelaide")).toBe("07:18 ACDT");
    expect(formatTimeZoned(START, "Australia/Perth")).toBe("04:48 AWST");
  });
  it("formats dates the Australian way", () => {
    expect(formatDate(START, "Australia/Sydney")).toBe("Fri 20 Nov 2026");
    expect(formatDateTime(START, "Australia/Sydney")).toBe("Fri 20 Nov 2026, 07:48 AEDT");
  });
});

describe("daylight saving, Sun 4 Oct 2026", () => {
  // Clocks go forward at 02:00 AEST (16:00 UTC Sat 3 Oct)
  const change = Date.UTC(2026, 9, 3, 16, 0);
  it("Sydney and Melbourne show AEST before and AEDT after", () => {
    expect(zoneAbbr(change - MINUTE, "Australia/Sydney")).toBe("AEST");
    expect(zoneAbbr(change, "Australia/Sydney")).toBe("AEDT");
    expect(zoneAbbr(change - MINUTE, "Australia/Melbourne")).toBe("AEST");
    expect(zoneAbbr(change + HOUR, "Australia/Melbourne")).toBe("AEDT");
  });
  it("Adelaide moves from ACST to ACDT", () => {
    expect(zoneAbbr(Date.UTC(2026, 8, 1), "Australia/Adelaide")).toBe("ACST");
    expect(zoneAbbr(START, "Australia/Adelaide")).toBe("ACDT");
  });
  it("Brisbane and Perth do not change", () => {
    expect(zoneAbbr(Date.UTC(2026, 8, 1), "Australia/Brisbane")).toBe("AEST");
    expect(zoneAbbr(START, "Australia/Brisbane")).toBe("AEST");
    expect(zoneAbbr(Date.UTC(2026, 8, 1), "Australia/Perth")).toBe("AWST");
    expect(zoneAbbr(START, "Australia/Perth")).toBe("AWST");
  });
  it("the Foundry burst reads in AEST", () => {
    // Sat 3 Oct 2026, 03:20 AEST = Fri 2 Oct 17:20 UTC
    expect(formatDateTime(Date.UTC(2026, 9, 2, 17, 20), "Australia/Melbourne")).toBe("Sat 3 Oct 2026, 03:20 AEST");
  });
});

describe("durations", () => {
  it("shows the two most significant units", () => {
    expect(formatDuration(3 * HOUR + 36 * MINUTE)).toBe("3 h 36 min");
    expect(formatDuration(5 * HOUR + 38 * MINUTE + 59_000)).toBe("5 h 38 min");
    expect(formatDuration(3 * DAY + 4 * HOUR + 12 * MINUTE)).toBe("3 d 4 h");
    expect(formatDuration(42 * MINUTE)).toBe("42 min");
    expect(formatDuration(20_000)).toBe("under 1 min");
  });
});
