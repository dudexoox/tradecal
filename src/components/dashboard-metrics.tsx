import Link from "next/link";
import type { Stats } from "@/lib/stats";
import { fmtMoney, fmtPct, fmtRatio, pnlColor } from "@/lib/format";
import { Icon } from "./icons";
import { SymbolLogo } from "./symbol-logo";
import type { ReactNode } from "react";

function Metric({ label, help, children }: { label: string; help: string; children: ReactNode }) {
  return <div className="dashboard-metric"><div className="metric-label">{label}<span title={help} className="ml-auto cursor-help text-dim/65"><Icon name="info" size={13}/></span></div>{children}</div>;
}

function Ring({ progress, color = "#0781fe" }: { progress: number; color?: string }) {
  const r = 21;
  const c = 2 * Math.PI * r;
  return <svg width="54" height="54" viewBox="0 0 54 54" fill="none" aria-hidden="true"><circle cx="27" cy="27" r={r} stroke="#f0f3f7" strokeWidth="6"/><circle cx="27" cy="27" r={r} stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${c * Math.min(100, Math.max(0, progress)) / 100} ${c}`} transform="rotate(-90 27 27)"/></svg>;
}

export function DashboardMetrics({ stats, currency, reviewed }: { stats: Stats; currency: string; reviewed: number }) {
  const completed = stats.total ? reviewed / stats.total * 100 : 0;
  const avgRatio = stats.avgLoss ? stats.avgWin / stats.avgLoss : stats.avgWin > 0 ? Infinity : 0;
  const wonPct = stats.grossProfit + stats.grossLoss > 0 ? stats.grossProfit / (stats.grossProfit + stats.grossLoss) * 100 : 50;
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
    <Metric label="Net P&L" help="The sum of the net P&L you logged for each trade.">
      <div className="num mt-3 text-[25px] font-semibold leading-none tracking-[-1px]">{fmtMoney(stats.netPnl, currency)}</div>
      <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted"><span className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 font-medium ${stats.netPnl >= 0 ? "bg-up/8 text-up" : "bg-down/8 text-down"}`}><Icon name="arrowUp" size={10} className={stats.netPnl < 0 ? "rotate-90" : ""}/>{fmtPct(stats.returnPct, 2)}</span><span>on starting balance</span></div>
    </Metric>
    <Metric label="Trade win rate" help="Winning trades divided by all logged trades, including breakeven trades.">
      <div className="mt-1 flex items-center justify-between"><span className="num text-[25px] font-semibold tracking-[-1px]">{fmtPct(stats.winRate, 0)}</span><Ring progress={stats.winRate} color="#29b28b"/></div>
      <div className="flex items-center gap-2 text-[10px] text-muted"><span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-up"/>{stats.wins} wins</span><span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-down"/>{stats.losses} losses</span>{stats.breakeven > 0 && <span>{stats.breakeven} BE</span>}</div>
    </Metric>
    <Metric label="Profit factor" help="Total profits divided by the absolute value of total losses.">
      <div className="num mt-3 text-[25px] font-semibold leading-none tracking-[-1px]">{fmtRatio(stats.profitFactor)}</div>
      <div className="mt-3"><div className="flex h-[5px] gap-0.5 overflow-hidden rounded-full"><span className="rounded-l-full bg-up/75" style={{ width: `${wonPct}%` }}/><span className="flex-1 rounded-r-full bg-down/65"/></div><p className="mt-2 text-[10px] text-muted">{fmtMoney(stats.grossProfit, currency, 0)} won · {fmtMoney(stats.grossLoss, currency, 0)} lost</p></div>
    </Metric>
    <Metric label="Avg. win / loss" help="Average winning trade compared with the average losing trade.">
      <div className="num mt-3 flex items-baseline gap-1.5 text-[19px] font-semibold tracking-[-0.7px]"><span className="text-up">{fmtMoney(stats.avgWin, currency, 0)}</span><span className="text-sm font-normal text-line-2">/</span><span className="text-down">{fmtMoney(stats.avgLoss, currency, 0)}</span></div>
      <div className="mt-3 text-[10px] text-muted"><span className="font-medium text-fg">{fmtRatio(avgRatio)}</span> win-to-loss ratio</div>
    </Metric>
    <Metric label="Journaled trades" help="A trade counts as journaled when you have added review notes.">
      <div className="mt-1 flex items-center justify-between"><span className="num text-[25px] font-semibold tracking-[-1px]">{reviewed}<span className="ml-1 text-base font-normal text-dim">/ {stats.total}</span></span><Ring progress={completed}/></div>
      <Link href="/trades?review=pending" className="text-link text-[10px]">{stats.total - reviewed ? `${stats.total - reviewed} waiting for a review` : "All caught up"}<Icon name="arrow" size={11}/></Link>
    </Metric>
  </div>;
}

export function SmallBreakdown({ title, rows, currency }: { title: string; rows: { label: string; logo?: string; pnl: number; trades: number; winRate: number }[]; currency: string }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.pnl)));
  return <section className="card p-5"><h2 className="chart-title mb-5">{title}</h2>{rows.length === 0 ? <p className="text-xs text-muted">Log a trade to see your results here.</p> : <div className="space-y-5">{rows.map((r) => <div key={r.label}><div className="flex items-baseline justify-between gap-3 text-xs"><span className="flex items-center gap-2 font-medium">{r.logo&&<SymbolLogo symbol={r.logo} size={16}/>}{r.label}</span><span className={`num font-medium ${pnlColor(r.pnl)}`}>{fmtMoney(r.pnl, currency, 0)}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel-2"><div className={`h-full rounded-full ${r.pnl >= 0 ? "bg-brand/75" : "bg-down/65"}`} style={{width: `${Math.max(1, Math.abs(r.pnl) / max * 100)}%`}}/></div><p className="mt-1.5 text-[10px] text-muted">{r.trades} trades · {fmtPct(r.winRate, 0)} win rate</p></div>)}</div>}</section>;
}
