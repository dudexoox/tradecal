import Link from "next/link";
import type { Trade, TradeTag } from "@/db/schema";
import { fmtDateShort, fmtDuration, fmtNum, fmtR, fmtTime } from "@/lib/format";
import { tradeR } from "@/lib/stats";
import { DEFAULT_COLUMNS, type TradeColumnKey } from "@/lib/views";
import { Icon } from "./icons";
import { SymbolLogo } from "./symbol-logo";
import { Pnl, Rating, SidePill } from "./ui";

const COLUMN_WIDTH: Record<TradeColumnKey, string> = {
  date: "minmax(100px, 1.15fr)",
  symbol: "minmax(104px, 1fr)",
  pnl: "minmax(100px, 1fr)",
  side: "62px",
  setup: "minmax(80px, 1fr)",
  rating: "88px",
  duration: "86px",
  size: "76px",
  tags: "minmax(96px, 1fr)",
  journal: "90px",
};

const COLUMN_LABEL: Record<TradeColumnKey, string> = {
  date: "Close date",
  symbol: "Symbol",
  pnl: "Net P&L / R",
  side: "Side",
  setup: "Setup",
  rating: "Execution",
  duration: "Duration",
  size: "Size",
  tags: "Tags",
  journal: "Journal",
};

export function TradesTable({
  trades,
  currency,
  compact = false,
  columns,
}: {
  trades: (Trade & { tags?: TradeTag[] })[];
  currency: string;
  compact?: boolean;
  columns?: TradeColumnKey[];
}) {
  if (compact) {
    return <CompactTradesTable trades={trades} currency={currency} />;
  }

  const cols = columns && columns.length > 0 ? columns : DEFAULT_COLUMNS;
  const showTags = !cols.includes("tags");
  const template = [...cols.map((key) => COLUMN_WIDTH[key]), "18px"].join(" ");

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <div
          className="trade-grid border-b border-line bg-panel-2/50 px-5 py-3.5 text-[10px] font-medium text-muted"
          style={{ gridTemplateColumns: template }}
        >
          {cols.map((key) => (
            <span key={key} className={key === "pnl" ? "text-right" : undefined}>
              {COLUMN_LABEL[key]}
            </span>
          ))}
          <span />
        </div>
        <ul className="divide-y divide-line">
          {trades.map((trade) => (
            <li key={trade.id}>
              <Link
                href={`/trades/${trade.id}`}
                className="trade-grid group min-h-[62px] px-5 py-2.5 transition-colors hover:bg-[#fafcff]"
                style={{ gridTemplateColumns: template }}
              >
                {cols.map((key) => (
                  <Cell key={key} column={key} trade={trade} currency={currency} showTags={showTags} />
                ))}
                <Icon name="chevron" size={13} className="text-line-2 transition-colors group-hover:text-brand" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[10px] text-muted">
        <span>
          {trades.length} {trades.length === 1 ? "trade" : "trades"}
        </span>
        <span>
          Click a trade to see the story behind it
          <Icon name="arrow" size={11} className="ml-1.5 inline" />
        </span>
      </div>
    </div>
  );
}

function Cell({
  column,
  trade,
  currency,
  showTags,
}: {
  column: TradeColumnKey;
  trade: Trade & { tags?: TradeTag[] };
  currency: string;
  showTags: boolean;
}) {
  switch (column) {
    case "date": {
      const when = trade.closedAt ?? trade.openedAt;
      return (
        <span>
          <span className="num block text-xs text-fg">{fmtDateShort(when)}</span>
          <span className="num mt-1 block text-[9px] text-dim">{fmtTime(when)}</span>
        </span>
      );
    }
    case "symbol":
      return (
        <span className="flex items-center gap-2">
          <SymbolLogo symbol={trade.symbol} size={26} />
          <span className="text-xs font-semibold tracking-[-0.15px]">{trade.symbol}</span>
          {(trade.chartImageUrl || trade.setupImageUrl || trade.tradingviewUrl) && (
            <span
              title={trade.tradingviewUrl && !trade.chartImageUrl ? "TradingView link attached" : "Image attached"}
              className="shrink-0 text-brand/70"
            >
              <Icon name={trade.tradingviewUrl && !trade.chartImageUrl ? "link" : "image"} size={12} />
            </span>
          )}
        </span>
      );
    case "pnl":
      return <PnlCell trade={trade} currency={currency} />;
    case "side":
      return <SidePill side={trade.direction} />;
    case "setup":
      return <SetupCell setup={trade.setup} tags={showTags ? trade.tags : undefined} />;
    case "rating":
      return <Rating value={trade.rating} />;
    case "duration":
      return <span className="num text-[11px] text-muted">{fmtDuration(trade.openedAt, trade.closedAt)}</span>;
    case "size":
      return <span className="num text-[11px] text-muted">{trade.size !== null ? `${fmtNum(trade.size)} lots` : "—"}</span>;
    case "tags":
      return <TagsCell tags={trade.tags} />;
    case "journal": {
      const reviewed = Boolean(trade.notes?.trim());
      return (
        <span
          title={reviewed ? trade.notes ?? undefined : "Open this trade to add review notes"}
          className={`flex items-center gap-1.5 text-[10px] ${reviewed ? "text-up" : "text-muted"}`}
        >
          <Icon name={reviewed ? "checkCircle" : "pen"} size={12} />
          {reviewed ? "Reviewed" : "Add notes"}
        </span>
      );
    }
  }
}

function PnlCell({ trade, currency }: { trade: Trade; currency: string }) {
  const r = tradeR(trade);
  return (
    <span className="text-right text-xs font-medium">
      <Pnl value={trade.pnl} currency={currency} />
      <span className={`mt-0.5 block text-[9px] font-normal ${r === null ? "text-dim" : "text-muted"}`}>
        {r === null ? "No R" : fmtR(r)}
      </span>
    </span>
  );
}

function SetupCell({ setup, tags }: { setup: string | null; tags?: TradeTag[] }) {
  return (
    <span className="min-w-0">
      <span className="block truncate text-xs text-muted">{setup ?? "—"}</span>
      {tags && tags.length > 0 && (
        <span className="mt-0.5 block truncate text-[9px] text-dim">
          {tags.slice(0, 2).map((tag) => tag.name).join(" · ")}
          {tags.length > 2 ? ` +${tags.length - 2}` : ""}
        </span>
      )}
    </span>
  );
}

function TagsCell({ tags }: { tags?: TradeTag[] }) {
  if (!tags || tags.length === 0) return <span className="text-xs text-dim">—</span>;
  return (
    <span className="flex min-w-0 flex-wrap gap-1">
      {tags.slice(0, 3).map((tag) => (
        <span
          key={tag.id}
          className="inline-flex max-w-full items-center truncate rounded-md px-1.5 py-0.5 text-[9px] font-medium"
          style={{ backgroundColor: `${tag.color}14`, color: tag.color }}
        >
          {tag.name}
        </span>
      ))}
      {tags.length > 3 && <span className="text-[9px] text-dim">+{tags.length - 3}</span>}
    </span>
  );
}

/** The narrow table used on the dashboard and the calendar page. */
function CompactTradesTable({ trades, currency }: { trades: (Trade & { tags?: TradeTag[] })[]; currency: string }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <div className="trade-grid compact border-b border-line bg-panel-2/50 px-5 py-3.5 text-[10px] font-medium text-muted">
          <span>Close date</span>
          <span>Symbol</span>
          <span>Setup</span>
          <span className="text-right">Net P&L / R</span>
          <span>Journal</span>
          <span />
        </div>
        <ul className="divide-y divide-line">
          {trades.map((trade) => {
            const when = trade.closedAt ?? trade.openedAt;
            const reviewed = Boolean(trade.notes?.trim());
            return (
              <li key={trade.id}>
                <Link href={`/trades/${trade.id}`} className="trade-grid compact group min-h-[62px] px-5 py-2.5 transition-colors hover:bg-[#fafcff]">
                  <span>
                    <span className="num block text-xs text-fg">{fmtDateShort(when)}</span>
                    <span className="num mt-1 block text-[9px] text-dim">{fmtTime(when)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <SymbolLogo symbol={trade.symbol} size={26} />
                    <span className="text-xs font-semibold tracking-[-0.15px]">{trade.symbol}</span>
                  </span>
                  <SetupCell setup={trade.setup} tags={trade.tags} />
                  <PnlCell trade={trade} currency={currency} />
                  <span
                    title={reviewed ? trade.notes ?? undefined : "Open this trade to add review notes"}
                    className={`flex items-center gap-1.5 text-[10px] ${reviewed ? "text-up" : "text-muted"}`}
                  >
                    <Icon name={reviewed ? "checkCircle" : "pen"} size={12} />
                    {reviewed ? "Reviewed" : "Add notes"}
                  </span>
                  <Icon name="chevron" size={13} className="text-line-2 transition-colors group-hover:text-brand" />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
