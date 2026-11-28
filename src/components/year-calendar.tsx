import Link from "next/link";
import type { YearDay, YearSummary } from "@/lib/yearly";
import { pnlLevel } from "@/lib/yearly";
import { fmtDateShort, fmtSignedMoney } from "@/lib/format";

const LEVEL_TONE: Record<number, string> = {
  4: "bg-up",
  3: "bg-up/70",
  2: "bg-up/45",
  1: "bg-up/20",
  0: "bg-panel-2",
  [-1]: "bg-down/20",
  [-2]: "bg-down/45",
  [-3]: "bg-down/70",
  [-4]: "bg-down",
};

const WEEKDAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", "Sun"];

export function YearCalendar({ summary, currency }: { summary: YearSummary; currency: string }) {
  /* The scale is the largest single-day result of the year, so the colour
     range always uses the full palette. */
  let scale = 0;
  for (const week of summary.weeks) {
    for (const day of week) scale = Math.max(scale, Math.abs(day.pnl));
  }
  if (scale <= 0) scale = 1;

  /* Month labels sit above the first week that starts a new month. */
  const monthMarks: { index: number; label: string }[] = [];
  let lastMonth = -1;
  summary.weeks.forEach((week, index) => {
    const firstOfMonth = week.find((day) => day.inYear && day.date.getDate() <= 7);
    if (firstOfMonth && firstOfMonth.date.getMonth() !== lastMonth) {
      lastMonth = firstOfMonth.date.getMonth();
      monthMarks.push({ index, label: firstOfMonth.date.toLocaleString("en-US", { month: "short" }) });
    }
  });

  return (
    <section className="card min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 className="text-xs font-semibold">Daily P&L — {summary.year}</h2>
        <div className="flex items-center gap-2 text-[10px] text-muted">
          <span>Loss</span>
          {[-4, -3, -2, -1, 0, 1, 2, 3, 4].map((level) => (
            <span key={level} className={`h-3 w-3 rounded-[3px] ${LEVEL_TONE[level]}`} />
          ))}
          <span>Profit</span>
        </div>
      </div>

      <div className="overflow-x-auto px-5 py-4">
        <div className="min-w-[720px]">
          <div className="mb-1 flex pl-[30px]">
            {summary.weeks.map((_, index) => {
              const mark = monthMarks.find((entry) => entry.index === index);
              return (
                <span key={index} className="w-[13px] shrink-0 text-[9px] text-dim">
                  {mark?.label ?? ""}
                </span>
              );
            })}
          </div>
          <div className="flex gap-[3px]">
            <div className="mr-[3px] flex w-[27px] shrink-0 flex-col gap-[3px]">
              {WEEKDAY_LABELS.map((label, index) => (
                <span key={index} className="flex h-[13px] items-center text-[9px] leading-none text-dim">
                  {label}
                </span>
              ))}
            </div>
            <div className="flex gap-[3px]">
              {summary.weeks.map((week, weekIndex) => (
                <div key={weekIndex} className="flex flex-col gap-[3px]">
                  {week.map((day) => (
                    <YearCell key={day.key} day={day} scale={scale} currency={currency} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function YearCell({ day, scale, currency }: { day: YearDay; scale: number; currency: string }) {
  if (!day.inYear) {
    return <span className="h-[13px] w-[13px] shrink-0 rounded-[3px] bg-transparent" />;
  }
  const level = pnlLevel(day.pnl, scale);
  const tone = day.inFuture ? "bg-panel-2/50" : LEVEL_TONE[level];
  const label = `${day.date.toDateString()}${day.trades ? `, ${fmtSignedMoney(day.pnl, currency)}, ${day.trades} trades` : ", no trades"}`;
  return (
    <Link
      href={`/day-view?date=${day.key}`}
      title={label}
      aria-label={label}
      className={`h-[13px] w-[13px] shrink-0 rounded-[3px] transition-transform hover:scale-125 ${tone}`}
    />
  );
}

/** The twelve month cards under the heatmap. */
export function MonthSummaries({ summary, currency }: { summary: YearSummary; currency: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {summary.months.map((month) => {
        const tone = month.pnl > 0 ? "text-up" : month.pnl < 0 ? "text-down" : "text-muted";
        return (
          <div key={month.month} className="card px-4 py-3.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold">{month.label}</span>
              <span className={`num text-xs font-semibold ${tone}`}>{fmtSignedMoney(month.pnl, currency, 0)}</span>
            </div>
            <p className="mt-1.5 text-[10px] text-muted">
              {month.trades} trades · {month.tradingDays} days
              {month.trades > 0 ? ` · ${Math.round(month.winRate)}% win` : ""}
            </p>
            {month.bestDay && (
              <p className="mt-1 text-[10px] text-dim">
                {month.worstDay && month.worstDay.key !== month.bestDay.key ? (
                  <>
                    Best {fmtDateShort(month.bestDay.date)} {fmtSignedMoney(month.bestDay.pnl, currency, 0)}
                    {" · worst "}
                    {fmtDateShort(month.worstDay.date)} {fmtSignedMoney(month.worstDay.pnl, currency, 0)}
                  </>
                ) : (
                  <>
                    {fmtDateShort(month.bestDay.date)} {fmtSignedMoney(month.bestDay.pnl, currency, 0)}
                  </>
                )}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
