import Link from "next/link";
import type { DayPnl } from "@/lib/stats";
import { dayKey, fmtDateShort, fmtSignedMoney, pnlColor } from "@/lib/format";
import { Icon } from "./icons";

const GRID =
  "grid grid-cols-[repeat(7,minmax(0,1fr))] gap-[5px] sm:grid-cols-[repeat(7,minmax(0,1fr))_76px] sm:gap-1.5";

function monthParam(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function parseMonth(raw: string | undefined): Date {
  const now = new Date();
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split("-").map(Number);
    if (y >= 1900 && y <= 2200 && m >= 1 && m <= 12) return new Date(y, m - 1, 1);
  }
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

type Week = { dates: Date[]; total: number; trades: number };

/** Weeks run Monday–Sunday, matching the grid rows. */
function buildWeeks(cells: Date[], map: Map<string, DayPnl>): Week[] {
  const weeks: Week[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const dates = cells.slice(i, i + 7);
    let total = 0;
    let trades = 0;
    for (const d of dates) {
      const day = map.get(dayKey(d));
      if (day) {
        total += day.pnl;
        trades += day.trades;
      }
    }
    weeks.push({ dates, total: Math.round(total * 100) / 100, trades });
  }
  return weeks;
}

function weekLabel(week: Week) {
  return `${fmtDateShort(week.dates[0])} – ${fmtDateShort(week.dates[6])}`;
}

export function MonthCalendar({ month, days, currency, entryDates = [], period, monthBasePath = "/" }: { month: Date; days: DayPnl[]; currency: string; entryDates?: string[]; period?: string; monthBasePath?: string }) {
  const map = new Map(days.map((d) => [d.key, d]));
  const notes = new Set(entryDates);
  const year = month.getFullYear(), mon = month.getMonth();
  const firstDow = (new Date(year, mon, 1).getDay() + 6) % 7;
  const count = new Date(year, mon + 1, 0).getDate();
  const cellCount = Math.ceil((firstDow + count) / 7) * 7;
  const cells = Array.from({ length: cellCount }, (_, i) => new Date(year, mon, i - firstDow + 1));
  const weeks = buildWeeks(cells, map);

  const current = days.filter((d) => d.date.getFullYear() === year && d.date.getMonth() === mon);
  const total = current.reduce((a, d) => a + d.pnl, 0);
  const winning = current.filter((d) => d.pnl > 0).length;
  const losing = current.filter((d) => d.pnl < 0).length;
  const today = dayKey(new Date());

  const upWeeks = weeks.filter((w) => w.total > 0);
  const downWeeks = weeks.filter((w) => w.total < 0);
  const sorted = [...weeks].sort((a, b) => a.total - b.total);
  const worst = sorted[0];
  const best = sorted[sorted.length - 1];
  const avgWeek = weeks.length ? weeks.reduce((a, w) => a + w.total, 0) / weeks.length : 0;
  const weekTotals = weeks.reduce((a, w) => a + w.total, 0);

  const href = (d: Date) => `${monthBasePath}?m=${monthParam(d)}${period ? `&period=${encodeURIComponent(period)}` : ""}`;
  const title = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(month);

  return <section className="card min-w-0 p-5">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Icon name="calendar" size={16} className="text-muted"/><h2 className="chart-title">Trading calendar</h2></div><div className="flex items-center gap-1"><Link href={href(new Date(year, mon - 1, 1))} className="icon-button h-7 w-7" aria-label="Previous month"><Icon name="chevron" size={14} className="rotate-180"/></Link><span className="min-w-[126px] text-center text-xs font-medium">{title}</span><Link href={href(new Date(year, mon + 1, 1))} className="icon-button h-7 w-7" aria-label="Next month"><Icon name="chevron" size={14}/></Link><Link href={href(new Date())} className="ml-1 rounded-md border border-line px-2 py-1 text-[10px] text-muted transition-colors hover:border-line-2">Today</Link></div></div>

    <div className="mb-4 flex flex-wrap items-center gap-3 text-[11px]"><span className="text-muted">Monthly P&L <strong className={`num ml-1.5 text-xs font-semibold ${total>0?"text-up":total<0?"text-down":"text-fg"}`}>{fmtSignedMoney(total,currency)}</strong></span><span className="h-3 w-px bg-line"/><span className="text-muted">{current.length} trading days</span><span className="h-3 w-px bg-line"/><span className="text-muted" title="Full Monday–Sunday weeks. The first and last row of a month can include days from the neighbouring month, so week totals and the monthly total can differ.">Week totals <strong className={`num ml-1.5 text-xs font-semibold ${weekTotals>0?"text-up":weekTotals<0?"text-down":"text-fg"}`}>{fmtSignedMoney(weekTotals,currency,0)}</strong></span></div>

    {/* weekday heads + week column label */}
    <div className={GRID}>
      {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => <div key={d} className="pb-2 text-center text-[10px] font-medium text-muted">{d}</div>)}
      <div className="hidden pb-2 text-center text-[10px] font-medium text-muted sm:block">Week</div>
    </div>

    {/* day cells, each week row followed by its week total */}
    <div className={GRID}>
      {cells.map((date,i) => {
        const key=dayKey(date), isMonth=date.getMonth()===mon, day=map.get(key);
        const hasNote=notes.has(key), isToday=key===today;
        const tone=!isMonth ? "border-transparent bg-panel-2/60 opacity-40" : day ? day.pnl>0 ? "border-up/12 bg-up/7" : day.pnl<0 ? "border-down/12 bg-down/7" : "bg-panel-2" : i%7>=5 ? "bg-panel-2/60" : "bg-white";
        const cell=<Link key={key} href={`/day-view?date=${key}`} aria-label={`${date.toDateString()}${day?`, ${fmtSignedMoney(day.pnl,currency)}, ${day.trades} trades`:", no trades"}${hasNote?", journal entry available":""}`} className={`calendar-cell ${tone} ${isToday?"ring-1 ring-brand/50":""}`}>
          <span className="flex items-center justify-between"><span className={`num text-[10px] font-medium ${isToday?"flex h-4 w-4 items-center justify-center rounded-full bg-brand text-white":"text-muted"}`}>{date.getDate()}</span>{hasNote&&<span title="Journal entry" className="h-1.5 w-1.5 rounded-full bg-brand/65"/>}</span>
          {day&&isMonth&&<div className="mt-auto pb-0.5 pt-3"><span className={`num block text-[10px] font-semibold tracking-[-0.3px] sm:text-[12px] ${day.pnl>0?"text-up":day.pnl<0?"text-down":"text-muted"}`}>{fmtSignedMoney(day.pnl,currency,0)}</span><span className="mt-0.5 hidden text-[9px] text-muted/80 sm:block">{day.trades} {day.trades===1?"trade":"trades"}</span></div>}
        </Link>;
        // Every 7th day closes a week row, so the week total gets its own grid column.
        const week=weeks[Math.floor(i/7)];
        if(i%7!==6||!week) return cell;
        const isCurrentWeek=week.dates.some((d)=>dayKey(d)===today);
        return [cell,<div key={`week-${i}`} title={`Week ${weekLabel(week)} · ${fmtSignedMoney(week.total,currency)} · ${week.trades} trades`} className={`hidden items-center justify-center rounded-md border sm:flex ${week.total>0?"border-up/15 bg-up/6":week.total<0?"border-down/15 bg-down/6":"border-line bg-panel-2"} ${isCurrentWeek?"ring-1 ring-brand/40":""}`}>
          <span className={`num text-[11px] font-semibold ${week.total>0?"text-up":week.total<0?"text-down":"text-dim"}`}>{fmtSignedMoney(week.total,currency,0)}</span>
        </div>];
      })}
    </div>

    {/* weekly breakdown for small screens, where the week column is hidden */}
    <div className="mt-4 flex gap-2 overflow-x-auto pb-1 sm:hidden">
      {weeks.map((w)=>w.trades>0&&<span key={w.dates[0].toISOString()} className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-line bg-panel-2 px-2.5 py-1.5 text-[10px]"><span className="text-muted">{weekLabel(w)}</span><span className={`num font-semibold ${pnlColor(w.total)}`}>{fmtSignedMoney(w.total,currency,0)}</span></span>)}
    </div>

    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted">
      <div className="flex items-center gap-3"><span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-up/80"/>{winning} winning days</span><span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-down/80"/>{losing} losing days</span><span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-brand/65"/>Journal entry</span></div>
      <div className="flex flex-wrap items-center gap-3"><span>{weeks.length} weeks · <span className="text-up">{upWeeks.length} up</span> / <span className="text-down">{downWeeks.length} down</span></span><span className="h-3 w-px bg-line"/><span className="num">avg week {fmtSignedMoney(avgWeek,currency,0)}</span><span className="h-3 w-px bg-line"/><span className="num">best {fmtSignedMoney(best?best.total:0,currency,0)} · worst {fmtSignedMoney(worst?worst.total:0,currency,0)}</span></div>
    </div>
  </section>;
}
