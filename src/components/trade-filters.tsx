"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Icon } from "./icons";

export function TradeFilters({ setups }: { setups: string[] }) {
  const router=useRouter(), pathname=usePathname(), params=useSearchParams();
  const [symbol,setSymbol]=useState(params.get("symbol")??"");
  const [pending,startTransition]=useTransition();
  const navigate=(changes: Record<string,string>)=>{
    const next=new URLSearchParams(params.toString());
    const values={symbol:symbol.trim(),...changes};
    for(const [k,v] of Object.entries(values)) { if(v) next.set(k,v); else next.delete(k); }
    startTransition(()=>router.replace(`${pathname}${next.size?`?${next}`:""}`,{scroll:false}));
  };
  const hasFilters=["symbol","direction","outcome","setup","review"].some((k)=>params.get(k));
  return <div className={`flex flex-wrap items-center gap-2 ${pending?"opacity-60":""}`}>
    <form className="relative mr-1" onSubmit={(e)=>{e.preventDefault();navigate({symbol});}}><input aria-label="Search by symbol" value={symbol} onChange={(e)=>setSymbol(e.target.value.toUpperCase())} placeholder="Search by symbol..." className="h-9 w-[180px] rounded-lg border border-line-2 bg-white pl-9 pr-3 text-xs text-fg outline-none placeholder:text-dim focus:border-brand"/><button type="submit" aria-label="Search trades" className="absolute inset-y-0 left-0 flex w-9 items-center justify-center text-muted"><Icon name="search" size={14}/></button></form>
    <Select label="Direction" value={params.get("direction")??""} onChange={(v)=>navigate({direction:v})}><option value="">All sides</option><option value="long">Long</option><option value="short">Short</option></Select>
    <Select label="Trade outcome" value={params.get("outcome")??""} onChange={(v)=>navigate({outcome:v})}><option value="">All outcomes</option><option value="win">Wins</option><option value="loss">Losses</option><option value="be">Breakeven</option></Select>
    {setups.length>0 && <Select label="Setup" value={params.get("setup")??""} onChange={(v)=>navigate({setup:v})}><option value="">All setups</option>{setups.map((s)=><option key={s} value={s}>{s}</option>)}</Select>}
    <Select label="Review status" value={params.get("review")??""} onChange={(v)=>navigate({review:v})}><option value="">Review status</option><option value="pending">Needs review</option><option value="reviewed">Reviewed</option></Select>
    {hasFilters && <button type="button" onClick={()=>{setSymbol("");startTransition(()=>router.replace(pathname,{scroll:false}));}} className="h-9 px-2 text-xs text-brand hover:underline">Clear filters</button>}
  </div>;
}

function Select({label,value,onChange,children}:{label:string;value:string;onChange:(v:string)=>void;children:ReactNode}) {
  return <label className="relative"><span className="sr-only">{label}</span><select value={value} onChange={(e)=>onChange(e.target.value)} className="h-9 appearance-none rounded-lg border border-line-2 bg-white pl-3 pr-8 text-xs text-muted outline-none transition-colors hover:border-brand/40 focus:border-brand">{children}</select><Icon name="down" size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted"/></label>;
}
