/**
 * UI preferences: theme, density, demo tray, role, tree drawer.
 * Selection is not here; it lives in the URL so links and reloads keep place.
 */
import { create } from "zustand";
import type { Role } from "@/domain/common";

export type ThemePref = "system" | "light" | "dark";
export type Density = "compact" | "comfortable";

interface UiState {
  theme: ThemePref;
  density: Density;
  trayOpen: boolean;
  treeOpen: boolean;
  role: Role;
  setTheme: (t: ThemePref) => void;
  setDensity: (d: Density) => void;
  setTrayOpen: (o: boolean) => void;
  setTreeOpen: (o: boolean) => void;
  setRole: (r: Role) => void;
}

const KEY = "tidemark.ui";

function load(): Partial<Pick<UiState, "theme" | "density">> {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Partial<Pick<UiState, "theme" | "density">>) : {};
  } catch {
    return {};
  }
}

function save(s: Pick<UiState, "theme" | "density">) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private window or blocked storage: preferences just do not persist */
  }
}

const initial = typeof window === "undefined" ? {} : load();

export const useUi = create<UiState>((set, get) => ({
  theme: initial.theme ?? "system",
  density: initial.density ?? "compact",
  trayOpen: false,
  treeOpen: false,
  role: "helen",
  setTheme: (theme) => {
    set({ theme });
    save({ theme, density: get().density });
  },
  setDensity: (density) => {
    set({ density });
    save({ theme: get().theme, density });
  },
  setTrayOpen: (trayOpen) => set({ trayOpen }),
  setTreeOpen: (treeOpen) => set({ treeOpen }),
  setRole: (role) => set({ role }),
}));

/** Mirrors theme and density onto <html> data attributes for the CSS tokens. */
export function applyDocumentPrefs(theme: ThemePref, density: Density) {
  const el = document.documentElement;
  if (theme === "system") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", theme);
  el.setAttribute("data-density", density);
}
