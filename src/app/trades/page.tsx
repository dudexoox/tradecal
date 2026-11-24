import Link from "next/link";
import { Suspense } from "react";
import { TradeFilters } from "@/components/trade-filters";
import { TradesTable } from "@/components/trades-table";
import { Empty, PageTitle, Pnl, Stat } from "@/components/ui";
import { Icon } from "@/components/icons";
import { getActiveAccount, getDistinctSetups, getTrades, type TradeFilters as Filters } from "@/lib/data";
import { computeStats } from "@/lib/stats";
import { fmtPct, fmtSignedMoney } from "@/lib/format";

export const dynamic = "force-dynamic";
type Search={symbol?:string;direction?:string;outcome?:string;setup?:string;review?:string};

export default async function TradesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp=await searchParams;
  const {account}=await getActiveAccount();
  if(!account) return <Empty title="Start with a trading account" body="Keep your trades and reviews together in one place." action={{href:"/accounts?new=1",label:"Add an account"}}/>;
  const filters:Filters={symbol:sp.symbol?.trim()||undefined,direction:sp.direction==="long"||sp.direction==="short"?sp.direction:undefined,outcome:sp.outcome==="win"||sp.outcome==="loss"||sp.outcome==="be"?sp.outcome:undefined,setup:sp.setup?.trim()||undefined,review:sp.review==="pending"||sp.review==="reviewed"?sp.review:undefined};
  const hasFilters=Object.values(filters).some(Boolean);
  const [trades,setups]=await Promise.all([getTrades(account.id,filters),getDistinctSetups(account.id)]);
  const stats=computeStats(account,trades);
  const reviewed=trades.filter((t)=>t.notes?.trim()).length;
  return <>
    <PageTitle title="Trade log" subtitle="Every trade has a story. Keep the details, find the lessons." action={<div className="flex gap-2"><a href="/api/trades/export" className="btn-ghost"><Icon name="download" size={15}/>Export CSV</a><Link href="/trades/new" className="btn-primary"><Icon name="plus" size={16}/>Add trade</Link></div>}/>
    <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4"><Stat label="Net P&L" value={<Pnl value={stats.netPnl} currency={account.currency}/>} hint={hasFilters?"Matching your filters":"Across all logged trades"}/><Stat label="Win rate" value={fmtPct(stats.winRate,0)} hint={`${stats.wins} wins · ${stats.losses} losses`}/><Stat label="Average trade" value={fmtSignedMoney(stats.expectancy,account.currency)} hint="Net result per trade"/><Stat label="Trades reviewed" value={`${reviewed} / ${trades.length}`} hint={trades.length===reviewed?"All caught up. Nice work.":`${trades.length-reviewed} opportunities to learn`}/></div>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><Suspense fallback={null}><TradeFilters key={sp.symbol??""} setups={setups}/></Suspense><span className="text-[10px] text-muted">{trades.length} {trades.length===1?"trade":"trades"}{hasFilters?" found":" total"}</span></div>
    {trades.length?<TradesTable trades={trades} currency={account.currency}/>:<Empty title={hasFilters?"No trades match these filters":"Your trade log starts here"} body={hasFilters?"Try a different symbol, setup, or review status.":"Log the numbers and capture your thinking. The lessons will follow."} action={hasFilters?{href:"/trades",label:"Clear filters"}:{href:"/trades/new",label:"Log your first trade"}}/>}
  </>;
}
