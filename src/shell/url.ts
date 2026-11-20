/**
 * Selection lives in the URL so links, reloads, back and forward keep place.
 *   ?inspect=device:FT-01   what the inspector shows
 *   ?scope=building:kendall-street-tower | state:NSW   what the tree scopes
 */
import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

export type InspectType = "incident" | "building" | "device" | "symbol" | "alert";

export interface InspectTarget {
  type: InspectType;
  id: string;
}

export function parseInspect(raw: string | null): InspectTarget | null {
  if (!raw) return null;
  const i = raw.indexOf(":");
  if (i < 1) return null;
  return { type: raw.slice(0, i) as InspectType, id: raw.slice(i + 1) };
}

export function useInspect() {
  const [params, setParams] = useSearchParams();
  const target = parseInspect(params.get("inspect"));
  const open = useCallback(
    (type: InspectType, id: string) =>
      setParams((p) => {
        const next = new URLSearchParams(p);
        next.set("inspect", `${type}:${id}`);
        return next;
      }),
    [setParams],
  );
  const close = useCallback(
    () =>
      setParams((p) => {
        const next = new URLSearchParams(p);
        next.delete("inspect");
        return next;
      }),
    [setParams],
  );
  return { target, open, close };
}

export type Scope = { kind: "organisation" } | { kind: "state"; id: string } | { kind: "building"; id: string };

export function parseScope(raw: string | null): Scope {
  if (!raw) return { kind: "organisation" };
  const [kind, id] = raw.split(":");
  if ((kind === "state" || kind === "building") && id) return { kind, id };
  return { kind: "organisation" };
}

export const inspectHref = (pathname: string, search: string, type: InspectType, id: string) => {
  const p = new URLSearchParams(search);
  p.set("inspect", `${type}:${id}`);
  return `${pathname}?${p.toString()}`;
};
