import * as Menu from "@radix-ui/react-dropdown-menu";
import { Link, NavLink, useLocation, useMatch } from "react-router-dom";
import { Menu as MenuIcon, PanelLeft, Search } from "lucide-react";
import { useSimNow } from "@/state/clock";
import { useUi } from "@/state/ui";
import { formatDateTime, formatTimeZoned } from "@/lib/format";
import { buildingById, ORGANISATION } from "@/mock/world/buildings";
import { Wordmark } from "./Wordmark";
import styles from "./TopBar.module.css";

export const NAV = [
  { to: "/portfolio", label: "Portfolio" },
  { to: "/incidents", label: "Incidents" },
  { to: "/logbook", label: "Logbook" },
  { to: "/devices", label: "Devices" },
  { to: "/water", label: "Water" },
  { to: "/reports/monthly", label: "Reports", match: "/reports" },
  { to: "/settings/escalation", label: "Settings", match: "/settings" },
] as const;

const PEOPLE = { helen: "Helen Castellano", marcus: "Marcus Teo", tom: "Tom Fitzgerald", kayla: "Kayla Ruiz" } as const;

export function TopBar() {
  const now = useSimNow();
  const role = useUi((s) => s.role);
  const treeOpen = useUi((s) => s.treeOpen);
  const setTreeOpen = useUi((s) => s.setTreeOpen);
  const { pathname } = useLocation();
  const buildingMatch = useMatch("/buildings/:id/*");
  const building = buildingMatch?.params.id ? buildingById.get(buildingMatch.params.id) : undefined;
  const viewerZone = ORGANISATION.viewerZone;

  return (
    <header className={styles.bar}>
      <button
        type="button"
        className={styles.treeToggle}
        aria-label={treeOpen ? "Hide buildings" : "Show buildings"}
        aria-expanded={treeOpen}
        onClick={() => setTreeOpen(!treeOpen)}
      >
        <PanelLeft size={18} strokeWidth={1.5} aria-hidden />
      </button>
      <Link to="/portfolio" className={styles.brand} aria-label="Tidemark, portfolio">
        <Wordmark />
      </Link>
      <nav aria-label="Primary" className={styles.nav}>
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) =>
              `${styles.link} ${isActive || ("match" in n && pathname.startsWith(n.match)) ? styles.active : ""}`
            }
          >
            {n.label}
          </NavLink>
        ))}
      </nav>
      <Menu.Root>
        <Menu.Trigger className={styles.menuButton} aria-label="Menu">
          <MenuIcon size={18} strokeWidth={1.5} aria-hidden />
          <span>Menu</span>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content className="menu" align="start" sideOffset={6}>
            {NAV.map((n) => (
              <Menu.Item key={n.to} asChild className="menu-item">
                <Link to={n.to}>{n.label}</Link>
              </Menu.Item>
            ))}
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
      <button type="button" className={styles.search} onClick={() => window.dispatchEvent(new Event("open-command-search"))} aria-keyshortcuts="Control+K">
        <Search size={14} strokeWidth={1.5} aria-hidden />
        <span>Search</span>
        <kbd aria-hidden>Ctrl K</kbd>
      </button>
      <div className={styles.meta}>
        <time className={styles.clock} dateTime={new Date(now).toISOString()}>
          <span className={styles.long}>{formatDateTime(now, viewerZone)}</span>
          <span className={styles.short}>{formatTimeZoned(now, viewerZone)}</span>
          {building && building.zone !== viewerZone && (
            <span className={styles.local}>
              {building.shortName} {formatTimeZoned(now, building.zone)}
            </span>
          )}
        </time>
        <span className={styles.person}>{PEOPLE[role]}</span>
      </div>
    </header>
  );
}
