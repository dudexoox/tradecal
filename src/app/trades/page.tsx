import Link from "next/link";
import { Suspense } from "react";
import { Icon } from "@/components/icons";
import { QuickLog } from "@/components/quick-log";
import { TradeFilters } from "@/components/trade-filters";
import { TradeViewsBar } from "@/components/trade-views-bar";
import { TradesTable } from "@/components/trades-table";
import { Empty, PageTitle, Pnl, Stat } from "@/components/ui";
import type { TradeViewFilters } from "@/db/schema";
import {
  getActiveAccount,
  getDistinctSetups,
  getDistinctSymbols,
  getTags,
  getTradeViews,
  getTrades,
  type TradeFilters as Filters,
} from "@/lib/data";
import { toLocalInput } from "@/lib/format";
import { computeStats } from "@/lib/stats";
import { fmtPct, fmtR, fmtSignedMoney } from "@/lib/format";
import { normaliseColumns, normaliseFilters, DEFAULT_COLUMNS } from "@/lib/views";

export const dynamic = "force-dynamic";

type Search = {
  symbol?: string;
  direction?: string;
  outcome?: string;
  setup?: string;
  tag?: string;
  review?: string;
  view?: string;
  columns?: string;
  logged?: string;
  viewError?: string;
};

export default async function TradesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const { account } = await getActiveAccount();
  if (!account)
    return (
      <Empty
        title="Start with a trading account"
        body="Keep your trades and reviews together in one place."
        action={{ href: "/accounts?new=1", label: "Add an account" }}
      />
    );

  const [views, setups, tags, symbols] = await Promise.all([
    getTradeViews(account.id),
    getDistinctSetups(account.id),
    getTags(),
    getDistinctSymbols(account.id),
  ]);

  const activeView = sp.view ? views.find((view) => view.id === Number(sp.view)) : undefined;

  /* The URL wins over the saved view, so a filter can always be overridden. */
  const urlFilters: TradeViewFilters = {};
  if (sp.symbol?.trim()) urlFilters.symbol = sp.symbol.trim();
  if (sp.direction === "long" || sp.direction === "short") urlFilters.direction = sp.direction;
  if (sp.outcome === "win" || sp.outcome === "loss" || sp.outcome === "be") urlFilters.outcome = sp.outcome;
  if (sp.setup?.trim()) urlFilters.setup = sp.setup.trim();
  if (sp.tag?.trim()) urlFilters.tag = sp.tag.trim();
  if (sp.review === "pending" || sp.review === "reviewed") urlFilters.review = sp.review;

  const filters: Filters = { ...normaliseFilters(activeView?.filters), ...urlFilters };
  const hasFilters = Object.keys(filters).length > 0;

  const urlColumns = sp.columns ? sp.columns.split(",").filter(Boolean) : [];
  const viewColumns = activeView?.columns ?? [];
  const columns =
    urlColumns.length || viewColumns.length
      ? normaliseColumns(urlColumns.length ? urlColumns : viewColumns)
      : DEFAULT_COLUMNS;

  const trades = await getTrades(account.id, filters);
  const stats = computeStats(account, trades);
  const reviewed = trades.filter((t) => t.notes?.trim()).length;

  const filterValues: Record<string, string> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value) filterValues[key] = String(value);
  }

  return (
    <>
      <PageTitle
        title="Trade log"
        subtitle="Every trade has a story. Keep the details, find the lessons."
        action={
          <div className="flex gap-2">
            <a href="/api/trades/export" className="btn-ghost">
              <Icon name="download" size={15} />
              Export CSV
            </a>
            <Link href="/trades/new" className="btn-primary">
              <Icon name="plus" size={16} />
              Add trade
            </Link>
          </div>
        }
      />

      <div className="space-y-4">
        {(sp.logged || sp.viewError) && (
          <p
            role="status"
            className={`flex items-center gap-2 rounded-lg px-4 py-3 text-xs ${
              sp.viewError ? "bg-down/7 text-down" : "bg-up/7 text-up"
            }`}
          >
            <Icon name={sp.viewError ? "info" : "checkCircle"} size={15} />
            {sp.viewError
              ? sp.viewError === "duplicate"
                ? "A view with that name already exists."
                : "That view could not be saved."
              : "Trade logged. Add the rest of the story whenever you have a minute."}
          </p>
        )}

        <QuickLog accountId={account.id} defaultTime={toLocalInput(new Date())} symbols={symbols} />

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Stat
            label="Net P&L"
            value={<Pnl value={stats.netPnl} currency={account.currency} />}
            hint={hasFilters ? "Matching your filters" : "Across all logged trades"}
          />
          <Stat label="Win rate" value={fmtPct(stats.winRate, 0)} hint={`${stats.wins} wins · ${stats.losses} losses`} />
          <Stat
            label="Average trade"
            value={fmtSignedMoney(stats.expectancy, account.currency)}
            hint="Net result per trade"
          />
          <Stat
            label="Average R"
            value={fmtR(stats.avgR)}
            hint={stats.rTrades ? `${stats.rTrades} trades with R` : "Add a stop or planned risk"}
          />
          <Stat
            label="Trades reviewed"
            value={`${reviewed} / ${trades.length}`}
            hint={trades.length === reviewed ? "All caught up. Nice work." : `${trades.length - reviewed} opportunities to learn`}
          />
        </div>

        <TradeViewsBar
          views={views.map((view) => ({ id: view.id, name: view.name, pinned: view.pinned }))}
          activeViewId={activeView?.id ?? null}
          accountId={account.id}
          filters={filters}
          columns={columns}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Suspense fallback={null}>
            <TradeFilters key={sp.symbol ?? ""} setups={setups} tags={tags} values={filterValues} />
          </Suspense>
          <span className="text-[10px] text-muted">
            {trades.length} {trades.length === 1 ? "trade" : "trades"}
            {hasFilters ? " found" : " total"}
          </span>
        </div>

        {trades.length ? (
          <TradesTable trades={trades} currency={account.currency} columns={columns} />
        ) : (
          <Empty
            title={hasFilters ? "No trades match these filters" : "Your trade log starts here"}
            body={
              hasFilters
                ? "Try a different symbol, setup, tag, or review status."
                : "Log the numbers and capture your thinking. The lessons will follow."
            }
            action={hasFilters ? { href: "/trades", label: "Clear filters" } : { href: "/trades/new", label: "Log your first trade" }}
          />
        )}
      </div>
    </>
  );
}
