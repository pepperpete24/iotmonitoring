/**
 * In-browser request router for the mock backend. Mirrors the REST paths in
 * docs/api-contract.md. Every request first brings the engine up to the
 * current simulated time.
 */
import { CommandError, type Command } from "@/mock/engine/engine";
import { engine, runCommand, sync } from "@/mock/runtime";
import { personById, PEOPLE } from "@/mock/world/people";
import { incidentDetail, incidentSummary, logbookView, portfolioStatus } from "./views";
import { buildingDetail, series } from "./views-building";

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
  const sms = engine.world.notifications.filter((n) => n.personId === personId && n.channel === "sms" && n.at <= engine.now && n.result !== "held");
  const recent = sms.slice(-4);
  return {
    recent: recent.length,
    recentFailed: recent.filter((n) => n.result === "failed").length,
    lastResult: recent[recent.length - 1]?.result ?? null,
    lastAt: recent[recent.length - 1]?.at ?? null,
  };
}

export function handle(method: string, path: string, body?: unknown): MockResponse {
  sync();
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
