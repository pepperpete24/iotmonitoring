import type { UtcMs } from "@/domain/common";

/** Fri 20 Nov 2026, 07:48:00 AEDT (UTC+11). The demo starts here. */
export const DEMO_START: UtcMs = Date.UTC(2026, 10, 19, 20, 48, 0);

/** The 90-day history window: Sat 22 Aug to Fri 20 Nov 2026. */
export const HISTORY_FROM: UtcMs = Date.UTC(2026, 7, 21, 14, 0); // Sat 22 Aug 00:00 AEST

/** First incident number in the window. The hero incident is the 47th. */
export const FIRST_INCIDENT_NUMBER = 121;
