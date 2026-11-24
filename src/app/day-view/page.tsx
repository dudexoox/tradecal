import Link from "next/link";
import { Icon } from "@/components/icons";
import { JournalForm } from "@/components/journal-form";
import { TradesTable } from "@/components/trades-table";
import { Empty, MoodPill, PageTitle, Pnl, SectionTitle } from "@/components/ui";
import { getActiveAccount, getJournalEntries, getTrades } from "@/lib/data";
import { dayKey, fmtDateShort, fmtPct } from "@/lib/format";
import { parseDay } from "@/lib/period";
import { computeStats, effectiveTime } from "@/lib/stats";

export const dynamic="force-dynamic";

export default async function DayJournalPage({searchParams}:{searchParams:Promise<{date?:string;edit?:string;saved?:string}>}) {
  const sp=await searchParams;
  const {account}=await getActiveAccount();
  if(!account) return <Empty title="Your sessions, in perspective" body="Add an account and log a trade to start your daily reviews." action={{href:"/accounts?new=1",label:"Add account"}}/>;
  const [allTrades,entries]=await Promise.all([getTrades(account.id),getJournalEntries()]);
  const full=computeStats(account,allTrades);
  const selected=parseDay(sp.date)??(allTrades[0]?parseDay(dayKey(effectiveTime(allTrades[0])))!:new Date());
  const key=dayKey(selected);
  const trades=allTrades.filter((t)=>dayKey(effectiveTime(t))===key);
  const stats=computeStats(account,trades);
  const entry=entries.find((e)=>e.entryDate===key);
  const ratings=trades.filter((t)=>t.rating!==null);
  const avgRating=ratings.length?ratings.reduce((n,t)=>n+(t.rating??0),0)/ratings.length:null;
  const previous=new Date(selected);previous.setDate(previous.getDate()-1);
  const next=new Date(selected);next.setDate(next.getDate()+1);
  const sessions=[...full.days].reverse();
  const dateTitle=new Intl.DateTimeFormat("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"}).format(selected);
  return <>
    <PageTitle title="Day journal" subtitle="Slow down. Review the session, not just the result." action={<form action="/day-view" method="get" className="flex gap-2"><label className="relative"><span className="sr-only">Session date</span><input type="date" name="date" defaultValue={key} className="h-10 rounded-lg border border-line-2 bg-white px-3 text-xs outline-none focus:border-brand"/></label><button type="submit" className="btn-ghost px-3" aria-label="Go to session"><Icon name="arrow" size={15}/></button></form>}/>
    <div className="grid items-start gap-5 xl:grid-cols-[190px_minmax(0,1fr)]">
      <aside className="card overflow-hidden"><h2 className="border-b border-line px-4 py-4 text-xs font-semibold">Trading sessions<span className="float-right text-[10px] font-normal text-muted">{sessions.length}</span></h2><div className="flex gap-1 overflow-x-auto p-2 xl:max-h-[720px] xl:flex-col xl:overflow-y-auto">{sessions.length?sessions.map((d)=><Link key={d.key} href={`/day-view?date=${d.key}`} className={`flex min-w-[150px] items-center justify-between gap-3 rounded-lg px-3 py-3 text-xs transition-colors ${d.key===key?"bg-brand/7 text-brand":"hover:bg-panel-2"}`}><span><span className="block text-[11px] font-medium">{fmtDateShort(d.date)}</span><span className="mt-1 block text-[9px] text-muted">{d.trades} {d.trades===1?"trade":"trades"}{entries.some((e)=>e.entryDate===d.key)?" · journaled":""}</span></span><Pnl value={d.pnl} currency={account.currency} className="text-[10px]"/></Link>):<p className="p-3 text-xs text-muted">No sessions yet.</p>}</div></aside>
      <div className="min-w-0 space-y-5">
        {sp.saved && <p role="status" className="flex items-center gap-2 rounded-lg bg-up/7 px-4 py-3 text-xs text-up"><Icon name="checkCircle" size={15}/>Your session reflection is saved.</p>}
        <section className="card overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4"><div><p className="section-eyebrow mb-1.5">Session review</p><h2 className="text-sm font-semibold tracking-[-0.2px]">{dateTitle}</h2></div><div className="flex gap-1"><Link href={`/day-view?date=${dayKey(previous)}`} className="icon-button" aria-label="Previous day"><Icon name="chevron" size={15} className="rotate-180"/></Link><Link href={`/day-view?date=${dayKey(next)}`} className="icon-button" aria-label="Next day"><Icon name="chevron" size={15}/></Link></div></div><dl className="grid grid-cols-2 gap-5 p-5 md:grid-cols-4"><div><dt className="text-[10px] text-muted">Net P&L</dt><dd className="mt-2 text-xl font-semibold tracking-[-0.5px]"><Pnl value={stats.netPnl} currency={account.currency}/></dd></div><div><dt className="text-[10px] text-muted">Total trades</dt><dd className="num mt-2 text-xl font-semibold">{stats.total}</dd></div><div><dt className="text-[10px] text-muted">Win rate</dt><dd className="num mt-2 text-xl font-semibold">{fmtPct(stats.winRate,0)}</dd></div><div><dt className="text-[10px] text-muted">Avg. execution</dt><dd className="num mt-2 text-xl font-semibold">{avgRating===null?"—":avgRating.toFixed(1)}<span className="ml-1 text-xs font-normal text-dim">/ 5</span></dd></div></dl></section>
        <section><SectionTitle action={<Link href="/trades/new" className="text-link"><Icon name="plus" size={12}/>Add trade</Link>}>Trades in this session</SectionTitle>{trades.length?<TradesTable trades={trades} currency={account.currency} compact/>:<div className="card px-5 py-8 text-center"><Icon name="calendar" size={24} className="mx-auto mb-3 text-dim"/><p className="text-xs text-muted">No trades for this day. You can still capture a reflection below.</p></div>}</section>
        <section><SectionTitle action={entry&&!sp.edit?<Link href={`/day-view?date=${key}&edit=1`} className="text-link"><Icon name="pen" size={12}/>Edit reflection</Link>:undefined}>The story behind the session</SectionTitle>{entry&&!sp.edit?<article className="card p-6"><div className="mb-5 flex items-center justify-between"><span className="flex items-center gap-2 text-xs font-medium"><Icon name="notebook" size={16} className="text-brand"/>Your reflection</span><MoodPill mood={entry.mood}/></div><p className="whitespace-pre-wrap text-[13px] leading-[1.9] text-muted">{entry.content}</p><div className="mt-6 border-t border-line pt-4"><Link href={`/journal?date=${key}`} className="text-link">Open in notebook<Icon name="arrow" size={13}/></Link></div></article>:<JournalForm key={entry?.id??key} entry={entry} defaultDate={key} returnTo="day-view"/>}</section>
      </div>
    </div>
  </>;
}
