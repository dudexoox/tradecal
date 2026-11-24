import Link from "next/link";
import { Suspense } from "react";
import { DashboardRange } from "@/components/dashboard-range";
import { SmallBreakdown } from "@/components/dashboard-metrics";
import { Icon } from "@/components/icons";
import { DailyPnlChart, PnlChart } from "@/components/performance-charts";
import { Empty, PageTitle, Pnl, SectionTitle, Stat } from "@/components/ui";
import { getActiveAccount, getTrades } from "@/lib/data";
import { fmtDateShort, fmtMoney, fmtPct, fmtSignedMoney } from "@/lib/format";
import { filterPeriod } from "@/lib/period";
import { computeStats, effectiveTime } from "@/lib/stats";

export const dynamic="force-dynamic";

export default async function ReportsPage({searchParams}:{searchParams:Promise<{period?:string}>}) {
  const {period}=await searchParams;
  const {account}=await getActiveAccount();
  if(!account) return <Empty title="Your edge is in your own data" body="Add an account and start logging trades to see your reports." action={{href:"/accounts?new=1",label:"Add account"}}/>;
  const trades=filterPeriod(await getTrades(account.id),period);
  const stats=computeStats(account,trades),currency=account.currency;
  const weekdays=[1,2,3,4,5,6,0].map((day)=>{
    const list=trades.filter((t)=>effectiveTime(t).getDay()===day);
    return {label:["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][day],pnl:list.reduce((n,t)=>n+t.pnl,0),trades:list.length,winRate:list.length?list.filter((t)=>t.pnl>0).length/list.length*100:0};
  }).filter((r)=>r.trades>0);
  const rated=[1,2,3,4,5].map((rating)=>{
    const list=trades.filter((t)=>t.rating===rating);
    return {label:`${rating}/5 execution`,pnl:list.reduce((n,t)=>n+t.pnl,0),trades:list.length,winRate:list.length?list.filter((t)=>t.pnl>0).length/list.length*100:0};
  }).filter((r)=>r.trades>0);
  const metrics=[{label:"Average winning trade",value:fmtMoney(stats.avgWin,currency)},{label:"Average losing trade",value:fmtMoney(stats.avgLoss,currency)},{label:"Largest win",value:fmtSignedMoney(stats.largestWin,currency)},{label:"Largest loss",value:fmtSignedMoney(stats.largestLoss,currency)},{label:"Best trading day",value:stats.bestDay?`${fmtDateShort(stats.bestDay.date)} · ${fmtSignedMoney(stats.bestDay.pnl,currency)}`:"—"},{label:"Worst trading day",value:stats.worstDay?`${fmtDateShort(stats.worstDay.date)} · ${fmtSignedMoney(stats.worstDay.pnl,currency)}`:"—"}];
  return <>
    <PageTitle title="Reports" subtitle="Less guesswork. More understanding of what works for you." action={<Suspense fallback={null}><DashboardRange/></Suspense>}/>
    <div className="space-y-5"><div className="grid grid-cols-2 gap-4 xl:grid-cols-4"><Stat label="Net P&L" value={<Pnl value={stats.netPnl} currency={currency}/>} hint={`${trades.length} trades in this period`}/><Stat label="Expectancy" value={fmtSignedMoney(stats.expectancy,currency)} hint="Average result per trade"/><Stat label="Max drawdown" value={fmtMoney(stats.maxDrawdown,currency,0)} hint={`${fmtPct(stats.maxDrawdownPct,2)} from peak`}/><Stat label="Trading days" value={stats.days.length} hint={`${stats.days.filter((d)=>d.pnl>0).length} profitable sessions`}/></div>
      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]"><section className="dashboard-chart"><SectionTitle>Cumulative net P&L</SectionTitle><PnlChart start={account.startingBalance} points={stats.equity} currency={currency}/></section><section className="dashboard-chart"><SectionTitle>Daily net P&L</SectionTitle><DailyPnlChart days={stats.days} currency={currency}/></section></div>
      <div className="grid items-start gap-5 md:grid-cols-2 xl:grid-cols-4"><SmallBreakdown title="Performance by setup" rows={stats.bySetup.map((s)=>({...s,label:s.setup}))} currency={currency}/><SmallBreakdown title="Performance by instrument" rows={stats.bySymbol.map((s)=>({...s,label:s.symbol,logo:s.symbol}))} currency={currency}/><SmallBreakdown title="Day of the week" rows={weekdays} currency={currency}/><SmallBreakdown title="Execution matters" rows={rated} currency={currency}/></div>
      <div className="grid gap-5 xl:grid-cols-2"><section className="card p-5"><SectionTitle>The details</SectionTitle><dl className="divide-y divide-line">{metrics.map((m)=><div key={m.label} className="flex items-center justify-between gap-3 py-3"><dt className="text-xs text-muted">{m.label}</dt><dd className="num text-xs font-medium">{m.value}</dd></div>)}</dl></section><section className="card p-5"><SectionTitle>Long vs. short</SectionTitle><div className="space-y-7 pt-3">{[{label:"Long trades",data:stats.longs},{label:"Short trades",data:stats.shorts}].map(({label,data})=><div key={label}><div className="flex items-center justify-between"><span className="text-xs font-medium">{label}</span><span className="text-xs font-medium"><Pnl value={data.pnl} currency={currency}/></span></div><div className="my-2.5 h-2 overflow-hidden rounded-full bg-down/15"><div className="h-full rounded-full bg-up/75" style={{width:`${data.winRate}%`}}/></div><p className="text-[10px] text-muted">{data.trades} trades · {fmtPct(data.winRate,0)} win rate</p></div>)}</div><div className="mt-8 flex items-start gap-3 rounded-lg bg-brand/5 p-4"><Icon name="notebook" size={17} className="mt-0.5 shrink-0 text-brand"/><div><p className="text-xs font-medium">Put a little context behind the numbers.</p><p className="mt-1 text-[11px] leading-relaxed text-muted">Found a pattern? Write down what you noticed and how you’ll use it.</p><Link href="/journal?new=1" className="text-link mt-3 text-[11px]">Capture an insight<Icon name="arrow" size={12}/></Link></div></div></section></div>
    </div>
  </>;
}
