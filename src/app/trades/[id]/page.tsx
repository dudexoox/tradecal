import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteTrade, updateTrade } from "@/app/actions";
import { DeleteButton } from "@/components/delete-button";
import { TradeForm } from "@/components/trade-form";
import { Icon } from "@/components/icons";
import { PageTitle, Pnl, Rating, SidePill } from "@/components/ui";
import { SymbolLogo } from "@/components/symbol-logo";
import { Figure, Placeholder, TradingViewCard } from "@/components/trade-media";
import { TradeChart } from "@/components/trade-chart";
import { getAccountById, getDistinctSetups, getDistinctSymbols, getTags, getTradeById } from "@/lib/data";
import { requireUser } from "@/lib/auth";
import { dayKey, fmtDateTime, fmtDuration, fmtMoney, fmtNum, fmtPrice, fmtR, toLocalInput } from "@/lib/format";
import { plannedRR, tradeR } from "@/lib/stats";
import { db } from "@/db";
import { strategies } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic="force-dynamic";

export default async function TradePage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{edit?:string}>}) {
  const [{id:raw},{edit}]=await Promise.all([params,searchParams]);
  const id=Number(raw);if(!Number.isInteger(id)) notFound();
  const userId=await requireUser();
  const trade=await getTradeById(id);if(!trade) notFound();
  const account=await getAccountById(trade.accountId);if(!account) notFound();
  const allStrategies=await db.select({id:strategies.id,name:strategies.name,criteria:strategies.entryCriteria}).from(strategies).where(eq(strategies.userId,userId)).orderBy(strategies.name);
  const strategyOptions=allStrategies.map((s)=>({id:s.id,name:s.name,criteria:s.criteria.split("\n").filter(Boolean)}));
  const strategyName=trade.strategyId?(allStrategies.find((s)=>s.id===trade.strategyId)?.name??null):null;
  if(edit) {
    const [setups,symbols,allTags]=await Promise.all([getDistinctSetups(account.id),getDistinctSymbols(account.id),getTags()]);
    return <div className="mx-auto max-w-[850px]"><Link href={`/trades/${id}`} className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted hover:text-brand"><Icon name="arrow" size={13} className="rotate-180"/>Back to trade</Link><PageTitle title={`Review ${trade.symbol}`} subtitle="Refine the details. Capture the lesson."/><TradeForm action={updateTrade.bind(null,trade.id)} trade={trade} accountId={account.id} setups={setups} symbols={symbols} strategies={strategyOptions} allTags={allTags} cancelHref={`/trades/${id}`} submitLabel="Save changes" openTime={toLocalInput(trade.openedAt)} closeTime={toLocalInput(trade.closedAt)}/></div>;
  }
  const realisedR=tradeR(trade), plannedR=plannedRR(trade);
  const facts=[{label:"Entry price",value:fmtPrice(trade.entryPrice)},{label:"Stop loss",value:fmtPrice(trade.stopLoss)},{label:"Take profit",value:fmtPrice(trade.takeProfit)},{label:"Exit price",value:fmtPrice(trade.exitPrice)},{label:"Position size",value:trade.size!==null?`${fmtNum(trade.size)} lots`:"—"},{label:"Planned risk",value:trade.riskAmount!==null?fmtMoney(trade.riskAmount,account.currency):"—"},{label:"R multiple",value:fmtR(realisedR)},{label:"Planned R:R",value:plannedR!==null?`1 : ${plannedR.toFixed(2)}`:"—"},{label:"Time in trade",value:fmtDuration(trade.openedAt,trade.closedAt)},{label:"Fees / swap",value:fmtMoney(trade.fees,account.currency)},{label:"Setup",value:trade.setup??"Not tagged"},{label:"Strategy",value:strategyName??"Not linked"},{label:"Source",value:trade.source==="mt5"?"MetaTrader 5 · auto-tracked":trade.source==="csv"?"Imported from CSV":"Entered by hand"}];
  const checks=[{label:"Tag the trade",done:trade.tags.length>0},{label:"Define your risk",done:trade.stopLoss!==null&&trade.takeProfit!==null},{label:"Tag a setup",done:Boolean(trade.setup?.trim())},{label:"Rate your execution",done:Boolean(trade.rating)},{label:"Write a trade review",done:Boolean(trade.notes?.trim())}];
  const done=checks.filter((c)=>c.done).length;
  return <>
    <Link href="/trades" className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted hover:text-brand"><Icon name="arrow" size={13} className="rotate-180"/>Back to trade log</Link>
    <PageTitle title={<span className="flex items-center gap-3"><SymbolLogo symbol={trade.symbol} size={40}/>{trade.symbol}</span>} subtitle={<span className="flex flex-wrap items-center gap-2"><SidePill side={trade.direction}/><span>{fmtDateTime(trade.openedAt)} UTC</span><span className="text-line-2">·</span><span>{account.name}</span>{trade.tags.length>0&&<><span className="text-line-2">·</span>{trade.tags.map((tag)=><span key={tag.id} className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium" style={{backgroundColor:`${tag.color}14`,color:tag.color}}>{tag.name}</span>)}</>}</span>} action={<div className="flex gap-2"><TradeChart trade={{ id: trade.id, symbol: trade.symbol, direction: trade.direction, openedAt: trade.openedAt.toISOString(), closedAt: trade.closedAt ? trade.closedAt.toISOString() : null, entryPrice: trade.entryPrice, exitPrice: trade.exitPrice, stopLoss: trade.stopLoss, takeProfit: trade.takeProfit, size: trade.size, riskAmount: trade.riskAmount, pnl: trade.pnl, currency: account.currency, accountName: account.name, setup: trade.setup, notes: trade.notes, rating: trade.rating }}/><DeleteButton action={deleteTrade.bind(null,id)} confirmText={`Delete this ${trade.symbol} trade? This cannot be undone.`}/><Link href={`/trades/${id}?edit=1`} className="btn-primary"><Icon name="pen" size={14}/>Edit & review</Link></div>}/>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-5"><section className="card overflow-hidden"><div className="flex items-end justify-between gap-5 p-6"><div><p className="text-xs text-muted">Net P&L</p><div className="mt-2 text-[34px] font-semibold tracking-[-1.2px]"><Pnl value={trade.pnl} currency={account.currency}/></div></div><div className="pb-2 text-right"><p className="mb-2 text-[10px] text-muted">Execution rating</p><Rating value={trade.rating}/></div></div><dl className="grid grid-cols-2 gap-x-6 gap-y-6 border-t border-line bg-panel-2/30 p-6 sm:grid-cols-3">{facts.map((f)=><div key={f.label}><dt className="text-[10px] text-muted">{f.label}</dt><dd className="num mt-1.5 text-[13px] font-medium">{f.value}</dd></div>)}</dl></section>
      <section className="card overflow-hidden"><div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4"><div className="flex items-center gap-2.5"><Icon name="chart" size={17} className="text-brand"/><h2 className="text-sm font-semibold">Chart &amp; setup</h2></div><Link href={`/trades/${id}?edit=1`} className="text-link">{trade.chartImageUrl||trade.setupImageUrl||trade.tradingviewUrl?"Edit":"Add chart"}<Icon name="arrow" size={13}/></Link></div>
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        {trade.chartImageUrl
          ? <Figure src={trade.chartImageUrl} alt={`Chart screenshot for ${trade.symbol}`} caption="Chart"/>
          : trade.tradingviewUrl
            ? <div className="h-[196px]"><TradingViewCard url={trade.tradingviewUrl}/></div>
            : <Placeholder label="No chart yet" hint="Attach a screenshot or a TradingView link."/>}
        {trade.setupImageUrl
          ? <Figure src={trade.setupImageUrl} alt={`Setup picture for ${trade.symbol}`} caption="Setup"/>
          : <Placeholder label="No setup picture yet" hint="The chart exactly as you read it."/>}
        {trade.chartImageUrl&&trade.tradingviewUrl&&<div className="sm:col-span-2"><TradingViewCard url={trade.tradingviewUrl}/></div>}
      </div></section>
      <section className="card p-6"><div className="mb-5 flex items-center gap-2"><Icon name="notebook" size={17} className="text-brand"/><h2 className="text-sm font-semibold">The story behind the trade</h2></div>{trade.notes?<p className="whitespace-pre-wrap text-[13px] leading-[1.9] text-muted">{trade.notes}</p>:<div className="rounded-lg border border-dashed border-line-2 bg-panel-2/30 p-6"><p className="text-sm font-medium">What would you tell your future self?</p><p className="mt-2 text-xs leading-relaxed text-muted">Write down your thesis, how you managed the trade, and one thing you’d repeat or change.</p><Link href={`/trades/${id}?edit=1`} className="text-link mt-4"><Icon name="pen" size={13}/>Add your review</Link></div>}</section></div>
      <aside className="space-y-5"><section className="card p-5"><h2 className="text-[13px] font-semibold">A complete picture</h2><p className="mt-1.5 text-[11px] text-muted">{done} of {checks.length} review steps complete</p><div className="mb-5 mt-3 h-1.5 rounded-full bg-panel-2"><div className="h-full rounded-full bg-brand/70" style={{width:`${done/checks.length*100}%`}}/></div><ul className="space-y-4">{checks.map((c)=><li key={c.label}><Link href={`/trades/${id}?edit=1`} className={`flex items-center gap-2.5 text-xs ${c.done?"text-muted":"text-fg"}`}><Icon name={c.done?"checkCircle":"pen"} size={16} className={c.done?"text-up/80":"text-dim"}/>{c.label}</Link></li>)}</ul></section><section className="rounded-xl border border-brand/12 bg-brand/4 p-5"><Icon name="calendar" size={20} className="mb-3 text-brand"/><h3 className="text-[13px] font-semibold">Zoom out to the session.</h3><p className="mt-2 text-xs leading-relaxed text-muted">A trade is one decision. Your calendar puts it in context.</p><Link href={`/day-view?date=${dayKey(trade.closedAt??trade.openedAt)}`} className="text-link mt-4">Open calendar<Icon name="arrow" size={13}/></Link></section></aside>
    </div>
  </>;
}
