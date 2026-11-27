"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

const LINKS: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/day-view", label: "Calendar", icon: "calendar" },
  { href: "/routine", label: "Start My Day", icon: "sparkles" },
  { href: "/trades", label: "Trade log", icon: "list" },
  { href: "/playbook", label: "Playbook", icon: "flag" },
  { href: "/reports", label: "Reports", icon: "chart" },
  { href: "/journal", label: "Notebook", icon: "notebook" },
];

const isPlaybook = (pathname: string) => pathname.startsWith("/playbook") || pathname.startsWith("/strategies");

/**
 * mobile=false → the docked sidebar navigation (labels collapse to a rail on lg).
 * mobile=true  → the scrollable quick-nav row under the topbar on tablet/mobile.
 */
export function NavLinks({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : href === "/playbook" ? isPlaybook(pathname) : pathname.startsWith(href);

  const linkClass = (active: boolean) =>
    mobile
      ? `flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
          active ? "bg-brand/8 text-brand" : "text-muted hover:bg-panel-2 hover:text-fg"
        }`
      : `sidebar-link ${active ? "active" : ""}`;

  return (
    <nav
      aria-label={mobile ? "Primary navigation" : "Workspace navigation"}
      className={mobile ? "flex gap-1.5 overflow-x-auto px-3 pb-2 lg:hidden" : "space-y-1"}
    >
      {LINKS.map((l) => {
        const active = isActive(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            title={l.label}
            aria-current={active ? "page" : undefined}
            className={linkClass(active)}
          >
            <Icon name={l.icon} size={mobile ? 15 : 18} />
            <span className="side-detail">{l.label}</span>
            {active && !mobile && <span className="side-detail ml-auto h-1.5 w-1.5 rounded-full bg-brand" />}
          </Link>
        );
      })}

      {!mobile && (
        <div className="mt-6 border-t border-line pt-5">
          <Link
            href="/accounts"
            title="Accounts"
            aria-current={pathname.startsWith("/accounts") ? "page" : undefined}
            className={`sidebar-link ${pathname.startsWith("/accounts") ? "active" : ""}`}
          >
            <Icon name="wallet" size={18} />
            <span className="side-detail">Accounts</span>
          </Link>
        </div>
      )}
    </nav>
  );
}

export function Breadcrumb() {
  const pathname = usePathname();
  const page = pathname.startsWith("/accounts")
    ? "Accounts"
    : isPlaybook(pathname)
      ? "Playbook"
      : (LINKS.find((l) => l.href !== "/" && pathname.startsWith(l.href))?.label ?? "Dashboard");
  return (
    <div className="hidden min-w-0 items-center gap-2.5 text-xs sm:flex">
      <span className="text-dim">Workspace</span>
      <Icon name="chevron" size={12} className="shrink-0 text-line-2" />
      <span className="truncate font-medium text-fg">{page}</span>
    </div>
  );
}
