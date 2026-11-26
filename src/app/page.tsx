import Link from "next/link";
import { Suspense } from "react";
import { MonthCalendar, parseMonth } from "@/components/calendar";
import { DashboardMetrics } from "@/components/dashboard-metrics";
import { DashboardRange } from "@/components/dashboard-range";
import { DailyPnlChart, PnlChart } from "@/components/performance-charts";
import { TradesTable } from "@/components/trades-table";
import { Empty, MoodPill, PageTitle, Pnl, SectionTitle } from "@/components/ui";
import { SymbolLogo } from "@/components/symbol-logo";
import { Icon } from "@/components/icons";
import { getActiveAccount, getJournalEntries, getTrades, maybeAutoSync } from "@/lib/data";
import { fmtDateShort } from "@/lib/format";
import { computeStats } from "@/lib/stats";
import { filterPeriod } from "@/lib/period";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ m?: string; period?: string }> }) {
  const { m, period } = await searchParams;
  const { account } = await getActiveAccount();
  if (!account) return <Empty title="A fresh page for your trading" body="Add a trading account to start tracking your trades and the lessons behind them." action={{href:"/accounts?new=1",label:"Add an account"}}/>;
  // Pull fresh broker history for auto-tracked MT5 accounts, then read the trades.
  await maybeAutoSync(account);
  const [allTrades, entries] = await Promise.all([getTrades(account.id),getJournalEntries()]);
  const trades = filterPeriod(allTrades,period);
  const stats = computeStats(account,trades);
  const fullStats = computeStats(account,allTrades);
  const reviewed = trades.filter((t) => t.notes?.trim()).length;
  const pending = allTrades.filter((t) => !t.notes?.trim());
  const lastEntry = entries[0];
  const currency = account.currency;
  const reviewPct = stats.total ? Math.round(reviewed/stats.total*100) : 0;
  return <>
    <PageTitle title="Dashboard" subtitle={<span className="flex flex-wrap items-center gap-3">A clearer picture of your trading. A little better, every day.{account.mt5Enabled&&<span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] ${account.mt5Status==="error"?"border-down/25 bg-down/6 text-down":"border-line bg-panel-2 text-muted"}`}><span className={`h-1.5 w-1.5 rounded-full ${account.mt5Status==="error"?"bg-down":"bg-up"}`}/>{account.mt5Status==="error"?"MT5 sync needs attention":account.mt5Mode==="live"?"MT5 auto-tracked":"MT5 auto-tracked · demo mode"}</span>}</span>} action={<div className="flex items-center gap-2.5"><Suspense fallback={<div className="h-10 w-[150px]"/>}><DashboardRange/></Suspense><Link href="/trades/new" className="btn-primary"><Icon name="plus" size={16}/>Add trade</Link></div>}/>
    <div className="mb-5 flex items-center justify-between border-b border-line"><div className="flex gap-6"><span className="-mb-px border-b-2 border-brand pb-3 text-xs font-semibold text-brand">Overview</span><Link href="/day-view" className="pb-3 text-xs font-medium text-muted transition-colors hover:text-fg">Calendar</Link></div><span className="pb-3 text-[10px] text-muted">{stats.total} trades<span className="mx-2 text-line-2">/</span>{currency}</span></div>
    <div className="space-y-5">
      <DashboardMetrics stats={stats} currency={currency} reviewed={reviewed}/>
      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <section className="dashboard-chart"><div className="flex items-start justify-between gap-4"><div><h2 className="chart-title">Cumulative net P&L</h2><p className="mt-1.5 text-[10px] text-muted">Your progress, one trade at a time</p></div><span className="mt-0.5 inline-flex items-center gap-1.5 text-[10px] text-muted"><span className="h-1.5 w-1.5 rounded-full bg-brand"/>Net P&L</span></div><PnlChart start={account.startingBalance} points={stats.equity} currency={currency}/></section>
        <section className="dashboard-chart"><div className="flex items-start justify-between gap-2"><div><h2 className="chart-title">Daily net P&L</h2><p className="mt-1.5 text-[10px] text-muted">Find the rhythm behind your results</p></div><Link href="/reports" className="icon-button -mr-1 -mt-1 h-7 w-7" aria-label="View performance reports"><Icon name="arrowUp" size={15}/></Link></div><DailyPnlChart days={stats.days} currency={currency}/></section>
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_285px] 2xl:grid-cols-[minmax(0,1fr)_310px]">
        <MonthCalendar month={parseMonth(m)} days={fullStats.days} currency={currency} entryDates={entries.map((e)=>e.entryDate)} period={period}/>
        <div className="space-y-5">
          <section className="overflow-hidden rounded-xl border border-[#deebfc] bg-[#eef6ff] p-5">
            <div className="mb-4 flex items-center justify-between"><span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-white text-brand shadow-[0_2px_4px_#0781fe08]"><Icon name="pen" size={18}/></span><span className="rounded-full border border-brand/15 px-2 py-0.5 text-[9px] font-medium text-brand">A moment for you</span></div>
            <h2 className="text-[17px] font-semibold tracking-[-0.5px]">The edge is in the review.</h2><p className="mt-2 text-xs leading-relaxed text-[#7891ac]">Go beyond the numbers. What worked, what didn’t, and what will you take into tomorrow?</p><Link href="/journal?new=1" className="mt-4 flex h-9 items-center justify-center gap-2 rounded-lg border border-brand/15 bg-white text-xs font-medium text-brand transition-colors hover:bg-brand hover:text-white"><Icon name="notebook" size={14}/>Write a reflection<Icon name="arrow" size={13}/></Link>
          </section>
          <section className="card p-5"><SectionTitle action={<span className="rounded-md bg-panel-2 px-1.5 py-0.5 text-[10px] text-muted">{pending.length}</span>}>Ready for a review</SectionTitle>{pending.length ? <ul className="-mx-1.5 space-y-1">{pending.slice(0,3).map((t) => <li key={t.id}><Link href={`/trades/${t.id}?edit=1`} className="group flex items-center justify-between gap-2 rounded-lg px-1.5 py-2 transition-colors hover:bg-panel-2"><span className="flex items-center gap-2.5"><SymbolLogo symbol={t.symbol} size={26}/><span><span className="block text-[11px] font-semibold">{t.symbol}</span><span className="mt-0.5 block text-[9px] text-muted">{fmtDateShort(t.closedAt??t.openedAt)} · <span className="capitalize">{t.direction}</span></span></span></span><span className="text-[11px]"><Pnl value={t.pnl} currency={currency}/></span><Icon name="chevron" size={12} className="text-dim group-hover:text-brand"/></Link></li>)}</ul> : <p className="flex items-center gap-2 py-3 text-xs text-up"><Icon name="checkCircle" size={16}/>You’re all caught up.</p>}<div className="mt-3 border-t border-line pt-3"><div className="mb-2 flex justify-between text-[10px] text-muted"><span>Your review progress</span><span className="font-medium text-fg">{reviewPct}%</span></div><div className="h-1.5 rounded-full bg-panel-2"><div className="h-full rounded-full bg-brand/70" style={{width:`${reviewPct}%`}}/></div></div></section>
        </div>
      </div>
      <section className="pt-1"><SectionTitle action={<Link href="/trades" className="text-link">View trade log<Icon name="arrow" size={13}/></Link>}>Recent trades<span className="ml-2 font-normal text-muted">A chance to reflect on your latest decisions</span></SectionTitle>{trades.length ? <TradesTable trades={trades.slice(0,5)} currency={currency} compact/> : <Empty title="Your next trade is a new page" body="Log a trade, capture your thinking, and start learning from your own decisions." action={{href:"/trades/new",label:"Log your first trade"}}/>}</section>
      {lastEntry && <section className="card flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:gap-6"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/6 text-brand"><Icon name="notebook" size={20}/></span><div className="min-w-0 flex-1"><div className="flex items-center gap-3"><span className="section-eyebrow">From your notebook</span><MoodPill mood={lastEntry.mood}/></div><p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-muted">“{lastEntry.content}”</p></div><Link href={`/journal?date=${lastEntry.entryDate}`} className="text-link shrink-0 self-center">Read reflection<Icon name="arrow" size={13}/></Link></section>}
      <p className="flex items-center justify-center gap-1.5 pt-3 text-[10px] text-dim"><Icon name="book" size={12}/>Progress, not perfection. Keep showing up.</p>
    </div>
  </>;
}
