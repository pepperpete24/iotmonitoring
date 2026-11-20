/**
 * Organisation, state, building (systems and devices join in M2). The tree
 * scopes every screen. Only abnormal nodes carry a glyph; a collapsed parent
 * shows its worst child's glyph so problems stay visible.
 *
 * Keyboard: Up and Down move, Right expands or enters, Left collapses or goes
 * to the parent, Home and End jump, Enter selects.
 */
import { useMemo, useRef, useState } from "react";
import { useLocation, useMatch, useNavigate, useSearchParams } from "react-router-dom";
import { usePortfolioStatus } from "@/api/queries";
import type { BuildingSummary } from "@/api/types";
import { STATE_ORDER, type Status, worstStatus } from "@/domain/common";
import { StatusGlyph } from "@/components/status/StatusGlyph";
import { STATUS_LABEL } from "@/domain/common";
import { useUi } from "@/state/ui";
import { parseScope } from "./url";
import styles from "./AssetTree.module.css";

interface Node {
  id: string;
  label: string;
  level: number;
  status: Status | "normal";
  parent?: string;
  children?: string[];
  kind: "organisation" | "state" | "building";
  count?: number;
}

export function AssetTree() {
  const { data, isPending, isError } = usePortfolioStatus();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  const buildingMatch = useMatch("/buildings/:id/*");
  const setTreeOpen = useUi((s) => s.setTreeOpen);
  const scope = parseScope(params.get("scope"));
  const selectedId = buildingMatch?.params.id
    ? `building:${buildingMatch.params.id}`
    : scope.kind === "organisation"
      ? "organisation"
      : `${scope.kind}:${scope.id}`;

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [focusId, setFocusId] = useState<string>("organisation");
  const listRef = useRef<HTMLUListElement>(null);

  const nodes = useMemo(() => {
    const map = new Map<string, Node>();
    if (!data) return map;
    const byState = new Map<string, BuildingSummary[]>();
    for (const b of data.buildings) byState.set(b.state, [...(byState.get(b.state) ?? []), b]);
    const states = STATE_ORDER.filter((s) => byState.has(s));
    map.set("organisation", {
      id: "organisation",
      label: data.organisation.shortName,
      level: 1,
      status: worstStatus(data.buildings.map((b) => b.status)),
      kind: "organisation",
      children: states.map((s) => `state:${s}`),
    });
    for (const s of states) {
      const list = [...byState.get(s)!].sort((a, b) => a.name.localeCompare(b.name));
      map.set(`state:${s}`, {
        id: `state:${s}`,
        label: s,
        level: 2,
        count: list.length,
        status: worstStatus(list.map((b) => b.status)),
        parent: "organisation",
        kind: "state",
        children: list.map((b) => `building:${b.id}`),
      });
      for (const b of list) {
        map.set(`building:${b.id}`, {
          id: `building:${b.id}`,
          label: b.name,
          level: 3,
          status: b.status,
          parent: `state:${s}`,
          kind: "building",
        });
      }
    }
    return map;
  }, [data]);

  const visible = useMemo(() => {
    const out: Node[] = [];
    const walk = (id: string) => {
      const n = nodes.get(id);
      if (!n) return;
      out.push(n);
      if (n.children && !collapsed.has(id)) n.children.forEach(walk);
    };
    walk("organisation");
    return out;
  }, [nodes, collapsed]);

  if (isPending) return <nav className={styles.tree} aria-label="Buildings" aria-busy />;
  if (isError) {
    return (
      <nav className={styles.tree} aria-label="Buildings">
        <p className={styles.message}>Buildings could not be loaded. Reload to try again.</p>
      </nav>
    );
  }

  const select = (n: Node) => {
    if (n.kind === "building") {
      const id = n.id.slice("building:".length);
      const onBuildingScreens = pathname.startsWith("/portfolio") || pathname.startsWith("/buildings");
      if (onBuildingScreens) navigate(`/buildings/${id}`);
      else setScope(`building:${id}`);
    } else if (n.kind === "state") {
      if (pathname.startsWith("/buildings")) navigate(`/portfolio?scope=${n.id}`);
      else setScope(n.id);
    } else {
      if (pathname.startsWith("/buildings")) navigate("/portfolio");
      else setScope(null);
    }
    setTreeOpen(false);
  };

  function setScope(value: string | null) {
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (value) next.set("scope", value);
      else next.delete("scope");
      return next;
    });
  }

  const toggle = (id: string, open?: boolean) =>
    setCollapsed((c) => {
      const next = new Set(c);
      const isOpen = !c.has(id);
      if (open ?? !isOpen) next.delete(id);
      else next.add(id);
      return next;
    });

  const focus = (id: string) => {
    setFocusId(id);
    listRef.current?.querySelector<HTMLElement>(`[data-node="${CSS.escape(id)}"]`)?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, n: Node) => {
    const i = visible.findIndex((v) => v.id === n.id);
    const isOpen = n.children && !collapsed.has(n.id);
    switch (e.key) {
      case "ArrowDown":
        if (visible[i + 1]) focus(visible[i + 1]!.id);
        break;
      case "ArrowUp":
        if (visible[i - 1]) focus(visible[i - 1]!.id);
        break;
      case "ArrowRight":
        if (n.children && !isOpen) toggle(n.id, true);
        else if (n.children?.[0]) focus(n.children[0]);
        break;
      case "ArrowLeft":
        if (isOpen) toggle(n.id, false);
        else if (n.parent) focus(n.parent);
        break;
      case "Home":
        focus(visible[0]!.id);
        break;
      case "End":
        focus(visible[visible.length - 1]!.id);
        break;
      case "Enter":
      case " ":
        select(n);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  return (
    <nav className={styles.tree} aria-label="Buildings">
      <ul role="tree" aria-label="Buildings" ref={listRef} className={styles.list}>
        {visible.map((n) => {
          const isOpen = n.children ? !collapsed.has(n.id) : undefined;
          // A node shows its glyph when it is a building, or when it is collapsed.
          const glyph = n.status !== "normal" && (n.kind === "building" || isOpen === false) ? n.status : null;
          return (
            <li
              key={n.id}
              role="treeitem"
              aria-level={n.level}
              aria-expanded={isOpen}
              aria-selected={selectedId === n.id}
              data-node={n.id}
              tabIndex={focusId === n.id ? 0 : -1}
              className={`${styles.node} ${styles[`l${n.level}`]}`}
              onClick={() => {
                setFocusId(n.id);
                select(n);
              }}
              onKeyDown={(e) => onKeyDown(e, n)}
            >
              {n.children ? (
                <span
                  className={styles.twisty}
                  aria-hidden
                  data-open={isOpen}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(n.id);
                  }}
                />
              ) : (
                <span className={styles.spacer} aria-hidden />
              )}
              <span className={styles.label}>
                {n.label}
                {n.count !== undefined && <span className={styles.count}> ({n.count})</span>}
              </span>
              {glyph && <StatusGlyph status={glyph} size={12} title={STATUS_LABEL[glyph]} />}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
