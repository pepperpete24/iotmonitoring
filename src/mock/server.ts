/**
 * In-browser request router for the mock backend. Mirrors the REST paths in
 * docs/api-contract.md.
 */
import type { PortfolioStatus } from "@/api/types";
import { selectPortfolioStatus } from "@/mock/selectors/portfolio";
import { simNow } from "@/state/clock";

interface MockResponse {
  status: number;
  body: unknown;
}

type Handler = (params: Record<string, string>, body: unknown) => MockResponse;

const ok = (body: unknown): MockResponse => ({ status: 200, body });

const routes: Array<[method: string, pattern: RegExp, keys: string[], handler: Handler]> = [
  ["GET", /^\/api\/portfolio\/status$/, [], () => ok(selectPortfolioStatus(simNow()) satisfies PortfolioStatus)],
];

export function handle(method: string, path: string, body?: unknown): MockResponse {
  const [pathname] = path.split("?");
  for (const [m, pattern, keys, handler] of routes) {
    if (m !== method) continue;
    const match = pattern.exec(pathname ?? "");
    if (!match) continue;
    const params: Record<string, string> = {};
    keys.forEach((k, i) => (params[k] = decodeURIComponent(match[i + 1] ?? "")));
    return handler(params, body);
  }
  return { status: 404, body: `No mock route for ${method} ${path}` };
}
