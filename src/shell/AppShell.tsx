import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useUi } from "@/state/ui";
import { TopBar } from "./TopBar";
import { WatchBar } from "./WatchBar";
import { AssetTree } from "./AssetTree";
import { Inspector } from "./Inspector";
import { DemoTray } from "./DemoTray";
import { CommandSearch } from "./CommandSearch";
import { useInspect } from "./url";
import styles from "./AppShell.module.css";

export function AppShell() {
  const { target } = useInspect();
  const treeOpen = useUi((s) => s.treeOpen);
  const setTreeOpen = useUi((s) => s.setTreeOpen);
  const { pathname } = useLocation();

  // Close the tree drawer on navigation.
  useEffect(() => setTreeOpen(false), [pathname, setTreeOpen]);

  return (
    <div className={styles.shell} data-inspector={target ? "open" : "closed"} data-tree={treeOpen ? "open" : "closed"}>
      <a href="#canvas" className={styles.skip}>
        Skip to content
      </a>
      <TopBar />
      <WatchBar />
      <AssetTree />
      {treeOpen && <div className={styles.scrim} onClick={() => setTreeOpen(false)} aria-hidden />}
      <main id="canvas" className={styles.canvas} tabIndex={-1}>
        <Outlet />
      </main>
      <Inspector />
      <DemoTray />
      <CommandSearch />
    </div>
  );
}
