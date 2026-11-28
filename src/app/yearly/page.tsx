import Link from "next/link";
import { MonthSummaries, YearCalendar } from "@/components/year-calendar";
import { Icon } from "@/components/icons";
import { Empty, PageTitle, Pnl, SectionTitle, Stat } from "@/components/ui";
import { getActiveAccount, getTrades } from "@/lib/data";
import { fmtDateShort, fmtPct, fmtR, fmtSignedMoney } from "@/lib/format";
import { buildYear } from "@/lib/yearly";
import { computeStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function YearlyPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const sp = await searchParams;
  const { account } = await getActiveAccount();
  if (!account)
    return (
      <Empty
        title="Your year, one square at a time"
        body="Add an account and every trading day will show up on the yearly heatmap."
        action={{ href: "/accounts?new=1", label: "Add account" }}
      />
    );

  const requested = Number(sp.year);
  const thisYear = new Date().getFullYear();
  const year = Number.isInteger(requested) && requested >= 1990 && requested <= 2200 ? requested : thisYear;

  const trades = await getTrades(account.id);
  const stats = computeStats(account, trades);
  const summary = buildYear(year, stats.days, trades);
  const currency = account.currency;

  const previous = year - 1;
  const next = year + 1;

  return (
    <>
      <PageTitle
        title="Yearly calendar"
        subtitle="Every trading day of the year, coloured by result."
        action={
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-line-2 bg-white p-0.5">
              <Link href={`/yearly?year=${previous}`} className="icon-button h-8 w-8" aria-label="Previous year">
                <Icon name="chevron" size={14} className="rotate-180" />
              </Link>
              <span className="num min-w-[64px] px-2 text-center text-xs font-medium">{year}</span>
              <Link href={`/yearly?year=${next}`} className="icon-button h-8 w-8" aria-label="Next year">
                <Icon name="chevron" size={14} />
              </Link>
            </div>
            {year !== thisYear && (
              <Link href="/yearly" className="btn-ghost h-9">
                This year
              </Link>
            )}
          </div>
        }
      />

      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Stat label="Year P&L" value={<Pnl value={summary.pnl} currency={currency} />} hint={`${summary.trades} trades`} />
          <Stat
            label="Win rate"
            value={fmtPct(summary.winRate, 0)}
            hint={`${summary.wins} wins · ${summary.trades - summary.wins} losses`}
          />
          <Stat
            label="Trading days"
            value={summary.tradingDays}
            hint={`${summary.profitableDays} up · ${summary.losingDays} down`}
          />
          <Stat
            label="Total R"
            value={fmtR(summary.totalR)}
            hint={summary.avgR !== null ? `${fmtR(summary.avgR)} average` : "Add a stop or planned risk"}
          />
          <Stat
            label="Best day"
            value={summary.bestDay ? fmtSignedMoney(summary.bestDay.pnl, currency, 0) : "—"}
            hint={summary.bestDay ? fmtDateShort(summary.bestDay.date) : "No trades yet"}
            tone="up"
          />
        </div>

        <YearCalendar summary={summary} currency={currency} />

        <section>
          <SectionTitle
            action={
              summary.bestMonth && summary.worstMonth ? (
                <span className="text-[10px] text-muted">
                  Best {summary.bestMonth.label} · worst {summary.worstMonth.label}
                </span>
              ) : undefined
            }
          >
            Month by month
          </SectionTitle>
          <MonthSummaries summary={summary} currency={currency} />
        </section>
      </div>
    </>
  );
}
