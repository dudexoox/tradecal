"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Icon } from "./icons";

export function DashboardRange() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <label className="relative inline-flex items-center"><Icon name="calendar" size={15} className="pointer-events-none absolute left-3.5 text-muted"/><span className="sr-only">Performance date range</span><select disabled={pending} value={params.get("period") ?? "all"} onChange={(e) => {
    const q = new URLSearchParams(params.toString());
    if (e.target.value === "all") q.delete("period"); else q.set("period", e.target.value);
    startTransition(() => router.push(`${pathname}${q.size ? `?${q}` : ""}`, { scroll: false }));
  }} className="h-10 w-[150px] appearance-none rounded-lg border border-line-2 bg-white pl-10 pr-7 text-xs font-medium text-fg outline-none focus:border-brand disabled:opacity-50"><option value="all">All time</option><option value="month">This month</option><option value="30days">Last 30 days</option></select><Icon name="down" size={12} className="pointer-events-none absolute right-3 text-muted"/></label>;
}
