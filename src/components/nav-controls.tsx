"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";

const SIDE_KEY = "tvsl:side";

/** Shell state lives on <html data-*>; ARIA on the buttons mirrors it so every
 *  close path (X, backdrop, Esc, navigation) stays consistent. */
function reflectDrawer(open: boolean) {
  const root = document.documentElement;
  if (open) root.setAttribute("data-drawer", "open");
  else root.removeAttribute("data-drawer");
  const button = document.querySelector<HTMLButtonElement>(".nav-hamburger");
  if (button) {
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
  }
}

const openDrawer = () => reflectDrawer(true);
const closeDrawer = () => reflectDrawer(false);

function setCollapsedFlag(collapsed: boolean) {
  const root = document.documentElement;
  if (collapsed) root.setAttribute("data-side", "collapsed");
  else root.removeAttribute("data-side");
  try {
    localStorage.setItem(SIDE_KEY, collapsed ? "collapsed" : "open");
  } catch {
    /* storage unavailable */
  }
}

/** Desktop (lg+): hide / show the docked sidebar. The preference persists and
 *  the icon swap happens purely in CSS, so React never re-renders for it. */
export function SidebarCollapseButton() {
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      const button = document.querySelector<HTMLButtonElement>(".side-collapse-btn");
      if (!button) return;
      const collapsed = root.getAttribute("data-side") === "collapsed";
      button.setAttribute("aria-pressed", String(collapsed));
      button.setAttribute("aria-label", collapsed ? "Show sidebar" : "Hide sidebar");
      button.setAttribute("title", collapsed ? "Show sidebar" : "Hide sidebar");
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["data-side"] });
    return () => observer.disconnect();
  }, []);

  return (
    <button
      type="button"
      className="side-collapse-btn"
      aria-controls="sidebar"
      aria-pressed={false}
      aria-label="Hide sidebar"
      title="Hide sidebar"
      onClick={() => setCollapsedFlag(document.documentElement.getAttribute("data-side") !== "collapsed")}
    >
      <Icon name="panel" size={17} className="icon-expanded" />
      <Icon name="chevron" size={17} className="icon-collapsed" />
    </button>
  );
}

/** Tablet & mobile: the hamburger opens an off-canvas drawer; the backdrop,
 *  floating X, Escape and any navigation all close it. */
export function MobileNavToggle() {
  const pathname = usePathname();
  const previousPath = useRef(pathname);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && document.documentElement.getAttribute("data-drawer") === "open") closeDrawer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Navigation means the drawer has done its job — close it for the next page.
  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    closeDrawer();
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        className="nav-hamburger"
        aria-expanded={false}
        aria-controls="sidebar"
        aria-label="Open navigation menu"
        title="Menu"
        onClick={() => (document.documentElement.getAttribute("data-drawer") === "open" ? closeDrawer() : openDrawer())}
      >
        <Icon name="menu" size={19} />
      </button>
      <button type="button" className="drawer-close" onClick={closeDrawer} aria-label="Close navigation menu" title="Close menu">
        <Icon name="plus" size={16} className="rotate-45" />
      </button>
      <div className="drawer-backdrop" onClick={closeDrawer} aria-hidden="true" />
    </>
  );
}
