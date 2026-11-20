/**
 * Ctrl K / Cmd K: jump to any building, incident, device, person or screen.
 * A floating layer, not a modal page. Arrow keys move, Enter opens, Esc closes.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { useDevices, useIncidents, usePeople, usePortfolioStatus } from "@/api/queries";
import { incidentHeadline } from "@/lib/headline";
import { NAV } from "./TopBar";
import styles from "./CommandSearch.module.css";

interface Hit {
  key: string;
  group: string;
  label: string;
  detail: string;
  to: string;
}

export function CommandSearch() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-command-search", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command-search", onOpen);
    };
  }, []);
  // the search data loads only once the layer is open
  return open ? <SearchLayer onClose={() => setOpen(false)} /> : null;
}

function SearchLayer({ onClose }: { onClose: () => void }) {
  const setOpen = (o: boolean) => (!o ? onClose() : undefined);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const portfolio = usePortfolioStatus();
  const incidents = useIncidents();
  const devices = useDevices();
  const people = usePeople();
  useEffect(() => {
    requestAnimationFrame(() => input.current?.focus());
  }, []);

  const hits = useMemo<Hit[]>(() => {
    const needle = q.trim().toLowerCase();
    const match = (...parts: string[]) => !needle || parts.join(" ").toLowerCase().includes(needle);
    const out: Hit[] = [];
    for (const n of NAV) if (match(n.label)) out.push({ key: `nav-${n.to}`, group: "Screens", label: n.label, detail: "", to: n.to });
    for (const b of portfolio.data?.buildings ?? []) if (match(b.name, b.suburb, b.state)) out.push({ key: b.id, group: "Buildings", label: b.name, detail: `${b.suburb} ${b.state}`, to: `/buildings/${b.id}` });
    for (const i of incidents.data ?? []) if (needle && match(i.id, i.buildingName, i.title, i.location)) out.push({ key: i.id, group: "Incidents", label: i.id, detail: `${i.buildingName}, ${incidentHeadline(i.title, i.location)}`, to: `/incidents/${i.id}` });
    for (const d of devices.data ?? []) if (needle && match(d.tag, d.buildingName, d.location, d.devEui, d.name ?? "")) out.push({ key: d.id, group: "Devices", label: d.tag, detail: `${d.buildingName}, ${d.location}`, to: `/devices/${encodeURIComponent(d.id)}` });
    for (const p of people.data ?? []) if (needle && match(p.name, p.title)) out.push({ key: p.id, group: "People", label: p.name, detail: p.title, to: "/settings/people" });
    // keep each group short so everything fits
    const per = new Map<string, number>();
    return out.filter((h) => {
      const n = (per.get(h.group) ?? 0) + 1;
      per.set(h.group, n);
      return n <= (needle ? 6 : 8);
    });
  }, [q, portfolio.data, incidents.data, devices.data, people.data]);

  const go = (h: Hit) => {
    setOpen(false);
    navigate(h.to);
  };
  return (
    <div className={styles.backdrop} onMouseDown={() => setOpen(false)}>
      <div className={styles.layer} role="dialog" aria-modal="true" aria-label="Search" onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.inputRow}>
          <Search size={16} strokeWidth={1.5} aria-hidden />
          <input
            ref={input}
            value={q}
            onChange={(e) => (setQ(e.target.value), setActive(0))}
            placeholder="Search buildings, incidents, devices and people"
            aria-label="Search"
            aria-controls="search-results"
            aria-activedescendant={hits[active] ? `hit-${hits[active]!.key}` : undefined}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setActive((a) => Math.min(hits.length - 1, a + 1));
              else if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
              else if (e.key === "Enter" && hits[active]) go(hits[active]!);
              else if (e.key === "Escape") setOpen(false);
              else return;
              e.preventDefault();
            }}
          />
        </div>
        <ul id="search-results" role="listbox" className={styles.results}>
          {hits.length === 0 && <li className={styles.empty}>Nothing matches "{q}". Try a building name, a tag like FT-01, or an incident number.</li>}
          {hits.map((h, k) => (
            <li key={h.key} id={`hit-${h.key}`} role="option" aria-selected={k === active} className={styles.hit} onMouseEnter={() => setActive(k)} onClick={() => go(h)}>
              {(k === 0 || hits[k - 1]!.group !== h.group) && <span className={styles.group}>{h.group}</span>}
              <span className={styles.label}>{h.label}</span>
              <span className={styles.detail}>{h.detail}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
