/**
 * In-browser request router for the mock backend. Mirrors the REST paths in
 * docs/api-contract.md. Every request first brings the engine up to the
 * current simulated time.
 */
import { CommandError, type Command } from "@/mock/engine/engine";
import { engine, runCommand, sync } from "@/mock/runtime";
import { useUi } from "@/state/ui";
import { personById, PEOPLE } from "@/mock/world/people";
import { incidentDetail, incidentSummary, logbookView, portfolioStatus } from "./views";
import { buildingDetail, deviceLive, series } from "./views-building";
import { deviceDetail, waterView } from "./views-more";
import { monthlyReport } from "./views-reports";
import { settingsView } from "./views-settings";
import { allDevices, nextTag, topologyOf } from "@/mock/world/topology";
import type { DeviceKind } from "@/domain/ingestion";
import { buildingById } from "@/mock/world/buildings";

interface MockResponse {
  status: number;
  body: unknown;
}

type Handler = (params: Record<string, string>, query: URLSearchParams, body: unknown) => MockResponse;

const ok = (body: unknown): MockResponse => ({ status: 200, body });
const notFound = (what: string): MockResponse => ({ status: 404, body: `No ${what}.` });

const routes: Array<[method: string, pattern: RegExp, keys: string[], handler: Handler]> = [
  ["GET", /^\/api\/portfolio\/status$/, [], () => ok(portfolioStatus(engine, engine.now))],

  [
    "GET",
    /^\/api\/buildings\/([^/]+)$/,
    ["id"],
    ({ id }) => {
      const b = buildingDetail(engine, id ?? "", engine.now);
      return b ? ok(b) : notFound(`building ${id}`);
    },
  ],

  [
    "GET",
    /^\/api\/devices$/,
    [],
    (_p, q) => {
      const building = q.get("building");
      const list = allDevices()
        .filter((d) => !building || d.buildingId === building)
        .map((d) => ({ ...deviceLive(engine, d, engine.now), buildingName: buildingById.get(d.buildingId)!.name, zone: buildingById.get(d.buildingId)!.zone }));
      return ok(list);
    },
  ],

  [
    "GET",
    /^\/api\/devices\/(.+)$/,
    ["id"],
    ({ id }) => {
      const d = deviceDetail(engine, id ?? "", engine.now);
      return d ? ok(d) : notFound(`device ${id}`);
    },
  ],

  [
    "GET",
    /^\/api\/reports\/monthly$/,
    [],
    (_p, q) => {
      const month = q.get("month") ?? "2026-10";
      if (!/^\d{4}-\d{2}$/.test(month)) return { status: 400, body: "Give the month as YYYY-MM, for example 2026-10." };
      return ok(monthlyReport(engine, month, engine.now));
    },
  ],

  ["GET", /^\/api\/settings$/, [], () => ok(settingsView(engine))],

  [
    "GET",
    /^\/api\/sms$/,
    [],
    (_p, q) => {
      const person = q.get("person") ?? "";
      const list = engine.world.notifications.filter((n) => n.personId === person && n.channel === "sms" && n.at <= engine.now + 30_000);
      return ok(list.slice(-Number(q.get("limit") ?? 3)).reverse());
    },
  ],

  [
    "GET",
    /^\/api\/buildings\/([^/]+)\/next-tag$/,
    ["id"],
    ({ id }, q) => {
      const level = topologyOf(id ?? "").levels.find((l) => l.id === q.get("level"));
      if (!level) return { status: 400, body: "Choose a level first." };
      return ok({ tag: nextTag(id ?? "", (q.get("kind") ?? "leak-sensor") as DeviceKind, level.short) });
    },
  ],

  [
    "GET",
    /^\/api\/water$/,
    [],
    (_p, q) => ok(waterView(engine, q.get("building") || null, engine.now)),
  ],

  [
    "GET",
    /^\/api\/series$/,
    [],
    (_p, q) => {
      const channel = q.get("channel") ?? "";
      const to = Math.min(Number(q.get("to") ?? engine.now), engine.now);
      const from = Number(q.get("from") ?? to - Number(q.get("span") ?? 86_400_000));
      const s = series(engine, channel, from, to, Number(q.get("points") ?? 400));
      return s ? ok(s) : notFound(`channel ${channel}`);
    },
  ],

  [
    "GET",
    /^\/api\/incidents$/,
    [],
    (_p, q) => {
      const state = q.get("state");
      const building = q.get("building");
      const list = engine.world.incidents
        .filter((i) => !state || (state === "active" ? i.state !== "resolved" : i.state === state))
        .filter((i) => !building || i.buildingId === building)
        .sort((a, b) => b.openedAt - a.openedAt)
        .map((i) => incidentSummary(engine, i, engine.now));
      return ok(list);
    },
  ],

  [
    "GET",
    /^\/api\/incidents\/([^/]+)$/,
    ["id"],
    ({ id }) => {
      const i = engine.world.incidents.find((x) => x.id === id);
      return i ? ok(incidentDetail(engine, i, engine.now)) : notFound(`incident ${id}`);
    },
  ],

  [
    "GET",
    /^\/api\/logbook$/,
    [],
    (_p, q) => {
      const building = q.get("building");
      const incident = q.get("incident");
      const actor = q.get("actor");
      const action = q.get("action");
      const limit = Number(q.get("limit") ?? 500);
      const list = engine.world.logbook
        .filter((e) => e.at <= engine.now)
        .filter((e) => !building || e.buildingId === building)
        .filter((e) => !incident || e.incidentId === incident)
        .filter((e) => !actor || e.actor === actor)
        .filter((e) => !action || e.action === action)
        .slice(-limit)
        .reverse()
        .map(logbookView);
      return ok(list);
    },
  ],

  [
    "GET",
    /^\/api\/people$/,
    [],
    () =>
      ok(
        PEOPLE.map((p) => ({
          ...p,
          mobileMasked: engine.contactOverrides.get(p.id) ?? p.mobileMasked,
          mobileFaulty: engine.world.contacts.faultyMobiles.has(p.id),
          sms: smsHealth(p.id),
        })),
      ),
  ],

  [
    "POST",
    /^\/api\/commands$/,
    [],
    (_p, _q, body) => {
      try {
        runCommand(body as Command);
        return ok({ ok: true, at: engine.now });
      } catch (e) {
        if (e instanceof CommandError) return { status: e.status, body: e.message };
        throw e;
      }
    },
  ],
];

/** SMS delivery health for a person: the last four SMS sent to them, newest last. */
function smsHealth(personId: string) {
  // delivery receipts arrive a few seconds after sending
  const sms = engine.world.notifications.filter((n) => n.personId === personId && n.channel === "sms" && n.at <= engine.now + 30_000 && n.result !== "held");
  const recent = sms.slice(-4);
  return {
    recent: recent.length,
    recentFailed: recent.filter((n) => n.result === "failed").length,
    lastResult: recent[recent.length - 1]?.result ?? null,
    lastAt: recent[recent.length - 1]?.at ?? null,
  };
}

/** Day one: an account with no buildings yet. Only the demo tray turns this on. */
function dayOne(method: string, pathname: string): MockResponse | null {
  if (method !== "GET") return null;
  if (pathname === "/api/portfolio/status") {
    return ok({
      organisation: { id: "new-customer", name: "Harbourline Property Partners", shortName: "Harbourline", viewerZone: "Australia/Sydney", tariffPerKL: engine.tariffPerKL },
      asOf: engine.now,
      briefing: { critical: [], warnings: 0, warningsUnacknowledged: 0, offline: 0, muted: 0, water24hL: 0, water24hUsualL: 0, weekday: "Friday" },
      buildings: [],
      openIncidents: [],
      deviceExceptions: [],
    });
  }
  if (pathname === "/api/incidents" || pathname === "/api/devices" || pathname === "/api/logbook") return ok([]);
  if (pathname.startsWith("/api/buildings/") || pathname === "/api/water" || pathname.startsWith("/api/incidents/") || pathname.startsWith("/api/devices/")) {
    return { status: 404, body: "No buildings yet." };
  }
  return null;
}

export function handle(method: string, path: string, body?: unknown): MockResponse {
  sync();
  if (useUi.getState().dayOne) {
    const r = dayOne(method, path.split("?")[0] ?? "");
    if (r) return r;
  }
  const [pathname, search] = path.split("?");
  const query = new URLSearchParams(search ?? "");
  for (const [m, pattern, keys, handler] of routes) {
    if (m !== method) continue;
    const match = pattern.exec(pathname ?? "");
    if (!match) continue;
    const params: Record<string, string> = {};
    keys.forEach((k, i) => (params[k] = decodeURIComponent(match[i + 1] ?? "")));
    return handler(params, query, body);
  }
  return { status: 404, body: `No mock route for ${method} ${path}` };
}

export { personById };
