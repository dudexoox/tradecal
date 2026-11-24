"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PublicAccount } from "@/db/schema";
import { setActiveAccount } from "@/app/actions";
import { Icon } from "./icons";

export function AccountSwitcher({ accounts, activeId }: { accounts: PublicAccount[]; activeId: number | null }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  if (accounts.length === 0) return null;
  return <label className="relative flex items-center">
    <span className="pointer-events-none absolute left-3 text-muted"><Icon name="wallet" size={15}/></span>
    <span className="sr-only">Active trading account</span>
    <select value={activeId ?? ""} disabled={pending} onChange={(e) => {
      const id = Number(e.target.value);
      startTransition(async () => { await setActiveAccount(id); router.refresh(); });
    }} className="h-9 max-w-[110px] appearance-none truncate rounded-lg border border-line bg-white pl-9 pr-8 text-xs font-medium text-fg outline-none hover:border-line-2 focus:border-brand disabled:opacity-50 sm:max-w-[168px] md:max-w-[215px]">
      {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
    <Icon name="down" size={13} className="pointer-events-none absolute right-3 text-muted"/>
  </label>;
}
