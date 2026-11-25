import Link from "next/link";
import { getActiveAccount } from "@/lib/data";
import { signOut } from "@/app/auth-actions";
import { NavLinks, Breadcrumb } from "./nav-links";
import { AccountSwitcher } from "./account-switcher";
import { MobileNavToggle, SidebarCollapseButton } from "./nav-controls";
import { Icon } from "./icons";

export function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="tradeVSL home">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-brand text-white shadow-[0_3px_8px_#0781fe25]">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 4.5h12a1 1 0 0 1 1 1v14H7a3 3 0 0 1-3-3v-10a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M8 4.5v15M10.5 14l2.5-3 2 1 2-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </span>
      <span className={`text-[25px] font-bold tracking-[-1.1px] text-fg ${collapsed ? "side-detail" : ""}`}>trade<span className="text-brand">VSL</span></span>
    </Link>
  );
}

export async function Header() {
  const { account, accounts } = await getActiveAccount();
  const today = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date());

  return (
    <>
      {/* Sidebar: off-canvas drawer below lg, docked (and collapsible) at lg+ */}
      <aside id="sidebar" className="workspace-sidebar" aria-label="Workspace sidebar">
        <div className="flex h-[87px] shrink-0 items-center px-6">
          <Logo collapsed />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <p className="section-eyebrow mb-3 px-3 side-detail">Your workspace</p>
          <NavLinks />
          <div className="side-detail relative mt-6 mb-2 overflow-hidden rounded-xl border border-[#e0edfc] bg-[#f3f8ff] p-4">
            <span className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-white text-brand"><Icon name="pen" size={17}/></span>
            <p className="text-[13px] font-semibold">Build your edge.</p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">A quick reflection today.<br/>A better trade tomorrow.</p>
            <Link href="/journal?new=1" className="text-link mt-4">Write a reflection <Icon name="arrow" size={13}/></Link>
            <span className="pointer-events-none absolute -right-4 -top-3 h-20 w-20 rounded-full border-[12px] border-brand/4"/>
          </div>
        </div>
        <div className="side-detail shrink-0 border-t border-line p-4">
          <Link href="/accounts" className="flex items-center gap-2.5 rounded-lg px-2 pb-1 pt-3 text-sm">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eef2f7] text-xs font-semibold text-muted">J</span>
            <span><span className="block text-xs font-semibold">My workspace</span><span className="mt-0.5 block text-[10px] text-muted">Personal trading journal</span></span>
            <Icon name="settings" size={16} className="ml-auto text-muted"/>
          </Link>
        </div>
      </aside>

      <header className="workspace-topbar">
        <div className="mx-auto flex h-[70px] max-w-[1580px] items-center justify-between gap-3 px-4 sm:px-7 xl:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <MobileNavToggle />
            <span className="lg:hidden"><Logo /></span>
            <SidebarCollapseButton />
            <Breadcrumb />
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <span className="hidden items-center gap-2 text-xs text-muted xl:inline-flex"><Icon name="calendar" size={15}/>{today}</span>
            <span className="hidden h-5 w-px bg-line xl:block"/>
            <AccountSwitcher accounts={accounts} activeId={account?.id ?? null} />
            <Link href="/accounts" aria-label="Manage workspace accounts" className="hidden h-8 w-8 items-center justify-center rounded-full border border-brand/15 bg-brand/6 text-[11px] font-semibold text-brand sm:flex">J</Link>
            <form action={signOut}>
              <button type="submit" aria-label="Sign out" title="Sign out"
                className="icon-button hover:text-down">
                <Icon name="logout" size={16}/>
              </button>
            </form>
          </div>
        </div>

        {/* Tablet & mobile: always-visible quick navigation under the topbar */}
        <NavLinks mobile />
      </header>
    </>
  );
}
