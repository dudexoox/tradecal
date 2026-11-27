import Link from "next/link";
import { Suspense } from "react";
import { deleteTag } from "@/app/tag-actions";
import { DashboardRange } from "@/components/dashboard-range";
import { DeleteButton } from "@/components/delete-button";
import { Icon } from "@/components/icons";
import { DailyPnlChart, PnlChart } from "@/components/performance-charts";
import { RDistribution, type RDistributionRow } from "@/components/r-distribution";
import { ReportBreakdown, type BreakdownRow } from "@/components/report-breakdown";
import { TagCreateForm } from "@/components/tag-create-form";
import { Empty, PageTitle, Pnl, SectionTitle, Stat } from "@/components/ui";
import type { Trade } from "@/db/schema";
import { getActiveAccount, getStrategiesForReports, getTags, getTrades } from "@/lib/data";
import { fmtDateShort, fmtMoney, fmtPct, fmtR, fmtSignedMoney } from "@/lib/format";
import { filterPeriod } from "@/lib/period";
import { computeStats, effectiveTime, groupPerformance, tradeR, type PerformanceRow } from "@/lib/stats";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "day-time", label: "Day & Time" },
  { id: "symbols", label: "Symbols" },
  { id: "playbook", label: "Playbook" },
  { id: "tags", label: "Tags" },
  { id: "risk", label: "Risk" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const SESSIONS = [
  { label: "Asia / early (00–07)", test: (hour: number) => hour <= 7 },
  { label: "London open (08–11)", test: (hour: number) => hour >= 8 && hour <= 11 },
  { label: "London–NY overlap (12–15)", test: (hour: number) => hour >= 12 && hour <= 15 },
  { label: "New York (16–20)", test: (hour: number) => hour >= 16 && hour <= 20 },
  { label: "Late session (21–23)", test: (hour: number) => hour >= 21 },
];

/** P&L, win rate and R-multiple summary for an arbitrary slice of trades. */
function summarize(list: Trade[]) {
  let pnl = 0;
  let wins = 0;
  let totalR = 0;
  let rTrades = 0;
  for (const trade of list) {
    pnl += trade.pnl;
    if (trade.pnl > 0) wins += 1;
    const r = tradeR(trade);
    if (r !== null) {
      totalR += r;
      rTrades += 1;
    }
  }
  return {
    pnl,
    trades: list.length,
    wins,
    winRate: list.length ? (wins / list.length) * 100 : 0,
    totalR,
    avgR: rTrades ? totalR / rTrades : null,
    rTrades,
  };
}

function toRow(row: PerformanceRow, label = row.key, logo?: string): BreakdownRow {
  return { label, pnl: row.pnl, trades: row.trades, winRate: row.winRate, avgR: row.avgR, logo };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; tab?: string }>;
}) {
  const { period, tab: rawTab } = await searchParams;
  const tab: TabId = TABS.some((entry) => entry.id === rawTab) ? (rawTab as TabId) : "overview";
  const { account } = await getActiveAccount();
  if (!account)
    return (
      <Empty
        title="Your edge is in your own data"
        body="Add an account and start logging trades to see your reports."
        action={{ href: "/accounts?new=1", label: "Add account" }}
      />
    );

  const [allTrades, allTags, strategies] = await Promise.all([
    getTrades(account.id),
    getTags(),
    getStrategiesForReports(),
  ]);
  const trades = filterPeriod(allTrades, period);
  const stats = computeStats(account, trades);
  const currency = account.currency;

  const tabHref = (id: TabId) => {
    const query = new URLSearchParams();
    if (period) query.set("period", period);
    if (id !== "overview") query.set("tab", id);
    return `/reports${query.size ? `?${query}` : ""}`;
  };

  /* --------------------------------- day & time -------------------------------- */
  const weekdayRows = groupPerformance(trades, (trade) => WEEKDAYS[effectiveTime(trade).getUTCDay()]).map((row) =>
    toRow(row, row.key),
  );
  const hourRows = groupPerformance(trades, (trade) => String(effectiveTime(trade).getUTCHours()))
    .sort((a, b) => Number(a.key) - Number(b.key))
    .map((row) => {
      const hour = Number(row.key);
      const next = (hour + 1) % 24;
      return toRow(row, `${String(hour).padStart(2, "0")}:00–${String(next).padStart(2, "0")}:00 UTC`);
    });
  const sessionRows = SESSIONS.map((session) => {
    const list = trades.filter((trade) => session.test(effectiveTime(trade).getUTCHours()));
    const summary = summarize(list);
    return { label: session.label, ...summary };
  }).filter((row) => row.trades > 0);

  /* ---------------------------------- symbols ---------------------------------- */
  const symbolRows = groupPerformance(trades, (trade) => trade.symbol).map((row) => toRow(row, row.key, row.key));
  const directionRows = groupPerformance(trades, (trade) => trade.direction).map((row) =>
    toRow(row, row.key === "long" ? "Long trades" : "Short trades"),
  );

  /* ---------------------------------- playbook --------------------------------- */
  const strategyNames = new Map(strategies.map((strategy) => [strategy.id, strategy.name]));
  const playbookRows = groupPerformance(trades, (trade) =>
    trade.strategyId ? strategyNames.get(trade.strategyId) ?? "Unknown strategy" : null,
  ).map((row) => toRow(row, row.key));
  const setupRows = groupPerformance(trades, (trade) => trade.setup).map((row) => toRow(row, row.key));
  const ratingRows = groupPerformance(trades, (trade) => (trade.rating ? `${trade.rating}/5` : null))
    .sort((a, b) => Number(b.key) - Number(a.key))
    .map((row) => toRow(row, `${row.key} execution`));
  const linkedToStrategy = trades.filter((trade) => trade.strategyId !== null).length;
  const withSetup = trades.filter((trade) => Boolean(trade.setup?.trim())).length;
  const withReview = trades.filter((trade) => Boolean(trade.notes?.trim())).length;
  const coverage = [
    { label: "Linked to a strategy", value: trades.length ? (linkedToStrategy / trades.length) * 100 : 0 },
    { label: "Tagged with a setup", value: trades.length ? (withSetup / trades.length) * 100 : 0 },
    { label: "Written up", value: trades.length ? (withReview / trades.length) * 100 : 0 },
  ];

  /* ------------------------------------ tags ----------------------------------- */
  const tagSummaries = allTags.map((tag) => {
    const list = trades.filter((trade) => trade.tags.some((attached) => attached.id === tag.id));
    return { tag, ...summarize(list) };
  });
  const tagRows: BreakdownRow[] = tagSummaries
    .filter((entry) => entry.trades > 0)
    .sort((a, b) => b.pnl - a.pnl)
    .map((entry) => ({
      label: entry.tag.name,
      pnl: entry.pnl,
      trades: entry.trades,
      winRate: entry.winRate,
      avgR: entry.avgR,
      dot: entry.tag.color,
    }));
  const untagged = summarize(trades.filter((trade) => trade.tags.length === 0));
  const tagUsage = new Map<number, number>();
  for (const trade of allTrades) for (const attached of trade.tags) tagUsage.set(attached.id, (tagUsage.get(attached.id) ?? 0) + 1);

  /* ------------------------------------ risk ----------------------------------- */
  const rValues = trades.map((trade) => tradeR(trade)).filter((value): value is number => value !== null);
  const distribution: RDistributionRow[] = [
    { label: "≤ −2R", count: rValues.filter((value) => value <= -2).length, tone: "down" },
    { label: "−2R–−1R", count: rValues.filter((value) => value > -2 && value <= -1).length, tone: "down" },
    { label: "−1R–0R", count: rValues.filter((value) => value > -1 && value < 0).length, tone: "down" },
    { label: "0R–1R", count: rValues.filter((value) => value >= 0 && value < 1).length, tone: "muted" },
    { label: "1R–2R", count: rValues.filter((value) => value >= 1 && value < 2).length, tone: "up" },
    { label: "2R–3R", count: rValues.filter((value) => value >= 2 && value < 3).length, tone: "up" },
    { label: "≥ 3R", count: rValues.filter((value) => value >= 3).length, tone: "up" },
  ];
  const withStop = trades.filter((trade) => trade.stopLoss !== null).length;
  const withTarget = trades.filter((trade) => trade.takeProfit !== null).length;
  const withRisk = trades.filter((trade) => trade.riskAmount !== null && trade.riskAmount > 0).length;
  const riskCoverage = [
    { label: "Stop loss recorded", count: withStop },
    { label: "Take profit recorded", count: withTarget },
    { label: "Planned risk recorded", count: withRisk },
  ];
  const riskSetupRows = groupPerformance(trades, (trade) => trade.setup).map((row) => toRow(row, row.key));

  const metrics = [
    { label: "Average winning trade", value: fmtMoney(stats.avgWin, currency) },
    { label: "Average losing trade", value: fmtMoney(stats.avgLoss, currency) },
    { label: "Largest win", value: fmtSignedMoney(stats.largestWin, currency) },
    { label: "Largest loss", value: fmtSignedMoney(stats.largestLoss, currency) },
    {
      label: "Best trading day",
      value: stats.bestDay ? `${fmtDateShort(stats.bestDay.date)} · ${fmtSignedMoney(stats.bestDay.pnl, currency)}` : "—",
    },
    {
      label: "Worst trading day",
      value: stats.worstDay ? `${fmtDateShort(stats.worstDay.date)} · ${fmtSignedMoney(stats.worstDay.pnl, currency)}` : "—",
    },
  ];

  return (
    <>
      <PageTitle
        title="Reports"
        subtitle="Less guesswork. More understanding of what works for you."
        action={
          <Suspense fallback={null}>
            <DashboardRange />
          </Suspense>
        }
      />

      <div className="mb-5 flex items-center justify-between gap-4 border-b border-line">
        <div className="flex gap-5 overflow-x-auto">
          {TABS.map((entry) => (
            <Link
              key={entry.id}
              href={tabHref(entry.id)}
              aria-current={tab === entry.id ? "page" : undefined}
              className={`-mb-px shrink-0 border-b-2 pb-3 text-xs font-medium transition-colors ${
                tab === entry.id ? "border-brand font-semibold text-brand" : "border-transparent text-muted hover:text-fg"
              }`}
            >
              {entry.label}
            </Link>
          ))}
        </div>
        <span className="hidden shrink-0 pb-3 text-[10px] text-muted sm:block">
          {trades.length} trades<span className="mx-2 text-line-2">/</span>{currency}
        </span>
      </div>

      <div className="space-y-5">
        {tab === "overview" && (
          <>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
              <Stat
                label="Net P&L"
                value={<Pnl value={stats.netPnl} currency={currency} />}
                hint={`${trades.length} trades in this period`}
              />
              <Stat label="Expectancy" value={fmtSignedMoney(stats.expectancy, currency)} hint="Average result per trade" />
              <Stat
                label="Max drawdown"
                value={fmtMoney(stats.maxDrawdown, currency, 0)}
                hint={`${fmtPct(stats.maxDrawdownPct, 2)} from peak`}
              />
              <Stat
                label="Trading days"
                value={stats.days.length}
                hint={`${stats.days.filter((day) => day.pnl > 0).length} profitable sessions`}
              />
              <Stat
                label="Average R"
                value={fmtR(stats.avgR)}
                hint={stats.rTrades ? `${stats.rTrades} trades with R` : "Add a stop or planned risk"}
              />
            </div>

            <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
              <section className="dashboard-chart">
                <SectionTitle>Cumulative net P&L</SectionTitle>
                <PnlChart start={account.startingBalance} points={stats.equity} currency={currency} />
              </section>
              <section className="dashboard-chart">
                <SectionTitle>Daily net P&L</SectionTitle>
                <DailyPnlChart days={stats.days} currency={currency} />
              </section>
            </div>

            <div className="grid items-start gap-5 md:grid-cols-2 xl:grid-cols-4">
              <ReportBreakdown title="Performance by setup" rows={setupRows} currency={currency} />
              <ReportBreakdown title="Performance by instrument" rows={symbolRows} currency={currency} />
              <ReportBreakdown title="Day of the week" rows={weekdayRows} currency={currency} note="Days are grouped in UTC." />
              <ReportBreakdown title="Execution matters" rows={ratingRows} currency={currency} />
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <section className="card p-5">
                <SectionTitle>The details</SectionTitle>
                <dl className="divide-y divide-line">
                  {metrics.map((metric) => (
                    <div key={metric.label} className="flex items-center justify-between gap-3 py-3">
                      <dt className="text-xs text-muted">{metric.label}</dt>
                      <dd className="num text-xs font-medium">{metric.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              <section className="card p-5">
                <SectionTitle>Long vs. short</SectionTitle>
                <div className="space-y-7 pt-3">
                  {[
                    { label: "Long trades", data: stats.longs },
                    { label: "Short trades", data: stats.shorts },
                  ].map(({ label, data }) => (
                    <div key={label}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">{label}</span>
                        <span className="text-xs font-medium">
                          <Pnl value={data.pnl} currency={currency} />
                        </span>
                      </div>
                      <div className="my-2.5 h-2 overflow-hidden rounded-full bg-down/15">
                        <div className="h-full rounded-full bg-up/75" style={{ width: `${data.winRate}%` }} />
                      </div>
                      <p className="text-[10px] text-muted">
                        {data.trades} trades · {fmtPct(data.winRate, 0)} win rate
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-8 flex items-start gap-3 rounded-lg bg-brand/5 p-4">
                  <Icon name="notebook" size={17} className="mt-0.5 shrink-0 text-brand" />
                  <div>
                    <p className="text-xs font-medium">Put a little context behind the numbers.</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted">
                      Found a pattern? Write down what you noticed and how you’ll use it.
                    </p>
                    <Link href="/journal?new=1" className="text-link mt-3 text-[11px]">
                      Capture an insight<Icon name="arrow" size={12} />
                    </Link>
                  </div>
                </div>
              </section>
            </div>
          </>
        )}

        {tab === "day-time" && (
          <>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <Stat label="Trading days" value={stats.days.length} hint="Sessions with at least one trade" />
              <Stat
                label="Best weekday"
                value={weekdayRows[0]?.label ?? "—"}
                hint={weekdayRows[0] ? `${fmtSignedMoney(weekdayRows[0].pnl, currency)} net` : "No trades yet"}
              />
              <Stat
                label="Best hour"
                value={hourRows[0]?.label.split("–")[0] ?? "—"}
                hint={hourRows[0] ? `${fmtSignedMoney(hourRows[0].pnl, currency)} net` : "No trades yet"}
              />
              <Stat
                label="Most active session"
                value={[...sessionRows].sort((a, b) => b.trades - a.trades)[0]?.label.split(" (")[0] ?? "—"}
                hint={[...sessionRows].sort((a, b) => b.trades - a.trades)[0]?.trades ?? 0}
              />
            </div>
            <div className="grid items-start gap-5 xl:grid-cols-2">
              <ReportBreakdown
                title="Performance by day"
                rows={weekdayRows}
                currency={currency}
                note="Days are grouped in UTC, so a session never splits across two days."
              />
              <ReportBreakdown
                title="Performance by hour"
                rows={hourRows}
                currency={currency}
                note="The hour a trade was closed, in UTC."
              />
            </div>
            <ReportBreakdown
              title="Trading sessions"
              rows={sessionRows}
              currency={currency}
              note="Sessions are UTC buckets: Asia, London, the London–New York overlap, New York and late hours."
            />
          </>
        )}

        {tab === "symbols" && (
          <>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <Stat label="Instruments traded" value={symbolRows.length} hint={`${trades.length} trades in this period`} />
              <Stat
                label="Best instrument"
                value={symbolRows[0]?.label ?? "—"}
                hint={symbolRows[0] ? `${fmtSignedMoney(symbolRows[0].pnl, currency)} net` : "No trades yet"}
              />
              <Stat
                label="Worst instrument"
                value={[...symbolRows].sort((a, b) => a.pnl - b.pnl)[0]?.label ?? "—"}
                hint={[...symbolRows].sort((a, b) => a.pnl - b.pnl)[0] ? `${fmtSignedMoney([...symbolRows].sort((a, b) => a.pnl - b.pnl)[0].pnl, currency)} net` : "No trades yet"}
              />
              <Stat
                label="Average R"
                value={fmtR(stats.avgR)}
                hint={stats.rTrades ? `${stats.rTrades} trades with R` : "Add a stop or planned risk"}
              />
            </div>
            <div className="grid items-start gap-5 xl:grid-cols-[1.4fr_1fr]">
              <ReportBreakdown title="Performance by instrument" rows={symbolRows} currency={currency} />
              <div className="space-y-5">
                <ReportBreakdown title="Long vs. short" rows={directionRows} currency={currency} />
                <section className="card p-5">
                  <SectionTitle>Symbol breakdown</SectionTitle>
                  <dl className="divide-y divide-line">
                    {symbolRows.length === 0 ? (
                      <p className="text-xs text-muted">Log a trade to see your instruments here.</p>
                    ) : (
                      symbolRows.map((row) => (
                        <div key={row.label} className="flex items-center justify-between gap-3 py-3">
                          <dt className="flex min-w-0 items-center gap-2 text-xs font-medium">
                            <span className="truncate">{row.label}</span>
                          </dt>
                          <dd className="flex shrink-0 items-center gap-3">
                            <span className="num text-[10px] text-muted">
                              {row.trades} {row.trades === 1 ? "trade" : "trades"}
                            </span>
                            <span className={`num text-xs font-medium ${row.pnl >= 0 ? "text-up" : "text-down"}`}>
                              {fmtSignedMoney(row.pnl, currency)}
                            </span>
                          </dd>
                        </div>
                      ))
                    )}
                  </dl>
                </section>
              </div>
            </div>
          </>
        )}

        {tab === "playbook" && (
          <>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <Stat label="Strategies" value={strategies.length} hint="In your playbook" />
              <Stat
                label="Linked trades"
                value={`${linkedToStrategy} / ${trades.length}`}
                hint="Trades attached to a strategy"
              />
              <Stat
                label="Setups used"
                value={setupRows.length}
                hint="Distinct setups in this period"
              />
              <Stat
                label="Average R"
                value={fmtR(stats.avgR)}
                hint={stats.rTrades ? `${stats.rTrades} trades with R` : "Add a stop or planned risk"}
              />
            </div>
            <div className="grid items-start gap-5 xl:grid-cols-2">
              <ReportBreakdown
                title="Performance by strategy"
                rows={playbookRows}
                currency={currency}
                empty="Link a strategy to your trades and its results will show up here."
              />
              <ReportBreakdown title="Performance by setup" rows={setupRows} currency={currency} />
            </div>
            <div className="grid items-start gap-5 xl:grid-cols-2">
              <ReportBreakdown title="Execution rating" rows={ratingRows} currency={currency} />
              <section className="card p-5">
                <SectionTitle>Journal coverage</SectionTitle>
                <p className="mb-5 text-[11px] leading-relaxed text-muted">
                  A trade only teaches you something when it is linked to a plan and written up.
                </p>
                <div className="space-y-5">
                  {coverage.map((item) => (
                    <div key={item.label}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">{item.label}</span>
                        <span className="num text-muted">{fmtPct(item.value, 0)}</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel-2">
                        <div className="h-full rounded-full bg-brand/75" style={{ width: `${item.value}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex items-start gap-3 rounded-lg bg-brand/5 p-4">
                  <Icon name="flag" size={17} className="mt-0.5 shrink-0 text-brand" />
                  <div>
                    <p className="text-xs font-medium">Keep the playbook honest.</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted">
                      Compare your actual results with the strategy you meant to trade.
                    </p>
                    <Link href="/playbook" className="text-link mt-3 text-[11px]">
                      Open playbook<Icon name="arrow" size={12} />
                    </Link>
                  </div>
                </div>
              </section>
            </div>
          </>
        )}

        {tab === "tags" && (
          <>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <Stat label="Tags" value={allTags.length} hint="In your tag library" />
              <Stat label="Tagged trades" value={trades.length - untagged.trades} hint={`${trades.length} trades in this period`} />
              <Stat label="Untagged trades" value={untagged.trades} hint={untagged.trades ? `${fmtSignedMoney(untagged.pnl, currency)} net` : "Everything is tagged"} />
              <Stat label="Best tag" value={tagRows[0]?.label ?? "—"} hint={tagRows[0] ? `${fmtSignedMoney(tagRows[0].pnl, currency)} net` : "No tagged trades yet"} />
            </div>
            <div className="grid items-start gap-5 xl:grid-cols-[1.4fr_1fr]">
              <ReportBreakdown
                title="Performance by tag"
                rows={tagRows}
                currency={currency}
                empty="Tag your trades with what you want to compare — mistakes, emotions, conditions."
              />
              <div className="space-y-5">
                <section className="card p-5">
                  <SectionTitle>Manage your tags</SectionTitle>
                  <p className="mb-4 text-[11px] leading-relaxed text-muted">
                    Tags are personal. Create the labels you want to compare later, then attach them while you log a trade.
                  </p>
                  <TagCreateForm />
                  <ul className="mt-5 divide-y divide-line rounded-lg border border-line">
                    {allTags.length === 0 ? (
                      <li className="px-3 py-4 text-[11px] text-muted">No tags yet. Add your first one above.</li>
                    ) : (
                      allTags.map((tag) => (
                        <li key={tag.id} className="flex items-center gap-3 px-3 py-2.5">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
                          <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{tag.name}</span>
                          <span className="num shrink-0 text-[10px] text-muted">
                            {tagUsage.get(tag.id) ?? 0} {tagUsage.get(tag.id) === 1 ? "trade" : "trades"}
                          </span>
                          <DeleteButton
                            action={deleteTag.bind(null, tag.id)}
                            label="Delete"
                            confirmText={`Delete the tag “${tag.name}”? It will be removed from every trade.`}
                            className="rounded-md px-2 py-1 text-[10px] font-medium text-muted transition-colors hover:bg-down/10 hover:text-down"
                          />
                        </li>
                      ))
                    )}
                  </ul>
                </section>
                <section className="rounded-xl border border-[#deebfc] bg-[#eef6ff] p-5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white text-brand shadow-[0_2px_4px_#0781fe08]">
                      <Icon name="sparkles" size={17} />
                    </span>
                    <div>
                      <h2 className="text-sm font-semibold tracking-[-0.2px]">Tag the story, not just the setup.</h2>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-[#7891ac]">
                        Tags like “FOMO”, “early entry” or “news” turn a list of trades into a pattern you can act on.
                      </p>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </>
        )}

        {tab === "risk" && (
          <>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <Stat label="Average R" value={fmtR(stats.avgR)} hint={stats.rTrades ? `${stats.rTrades} trades with R` : "Add a stop or planned risk"} />
              <Stat label="Total R" value={fmtR(stats.totalR)} hint="Sum of realised R-multiples" />
              <Stat
                label="Average planned R:R"
                value={stats.avgPlannedRR !== null ? `1 : ${stats.avgPlannedRR.toFixed(2)}` : "—"}
                hint="Target versus stop"
              />
              <Stat
                label="Win rate"
                value={fmtPct(stats.winRate, 0)}
                hint={`${stats.wins} wins · ${stats.losses} losses`}
              />
            </div>
            <div className="grid items-start gap-5 xl:grid-cols-[1.3fr_1fr]">
              <section className="card p-5">
                <SectionTitle>R-multiple distribution</SectionTitle>
                <p className="mb-5 text-[11px] leading-relaxed text-muted">
                  How your results land in risk units. One R is the amount you planned to lose.
                </p>
                <RDistribution rows={distribution} />
              </section>
              <section className="card p-5">
                <SectionTitle>Risk coverage</SectionTitle>
                <p className="mb-5 text-[11px] leading-relaxed text-muted">
                  Risk data only exists when you record it. Add the missing pieces to unlock R-multiples.
                </p>
                <div className="space-y-5">
                  {riskCoverage.map((item) => (
                    <div key={item.label}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">{item.label}</span>
                        <span className="num text-muted">
                          {item.count} / {trades.length}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel-2">
                        <div
                          className="h-full rounded-full bg-brand/75"
                          style={{ width: `${trades.length ? (item.count / trades.length) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <Link href="/trades/new" className="btn-ghost mt-6 h-9 w-full">
                  <Icon name="plus" size={14} />
                  Log a trade with risk
                </Link>
              </section>
            </div>
            <div className="grid items-start gap-5 xl:grid-cols-2">
              <ReportBreakdown title="Risk by direction" rows={directionRows} currency={currency} />
              <ReportBreakdown title="Risk by setup" rows={riskSetupRows} currency={currency} />
            </div>
          </>
        )}
      </div>
    </>
  );
}
