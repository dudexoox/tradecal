import Link from "next/link";
import type { Trade, TradeTag } from "@/db/schema";
import { fmtDateShort, fmtR, fmtTime } from "@/lib/format";
import { tradeR } from "@/lib/stats";
import { Icon } from "./icons";
import { SymbolLogo } from "./symbol-logo";
import { Pnl, Rating, SidePill } from "./ui";

export function TradesTable({ trades, currency, compact = false }: { trades: (Trade & { tags?: TradeTag[] })[]; currency: string; compact?: boolean }) {
  const grid = `trade-grid ${compact ? "compact" : ""}`;
  return <div className="card overflow-hidden"><div className="overflow-x-auto"><div className={`${grid} border-b border-line bg-panel-2/50 px-5 py-3.5 text-[10px] font-medium text-muted`}>
    <span>Close date</span><span>Symbol</span>{compact ? <><span>Setup</span><span className="text-right">Net P&L / R</span></> : <><span className="text-right">Net P&L / R</span><span>Side</span><span>Setup</span><span>Execution</span></>}<span>Journal</span><span/>
  </div><ul className="divide-y divide-line">{trades.map((t) => {
    const when=t.closedAt??t.openedAt;
    const reviewed=Boolean(t.notes?.trim());
    return <li key={t.id}><Link href={`/trades/${t.id}`} className={`${grid} group min-h-[62px] px-5 py-2.5 transition-colors hover:bg-[#fafcff]`}>
      <span><span className="num block text-xs text-fg">{fmtDateShort(when)}</span><span className="num mt-1 block text-[9px] text-dim">{fmtTime(when)}</span></span>
      <span className="flex items-center gap-2"><SymbolLogo symbol={t.symbol} size={26}/><span className="text-xs font-semibold tracking-[-0.15px]">{t.symbol}</span>{(t.chartImageUrl||t.setupImageUrl||t.tradingviewUrl)&&<span title={t.tradingviewUrl&&!t.chartImageUrl?"TradingView link attached":"Image attached"} className="shrink-0 text-brand/70"><Icon name={t.tradingviewUrl&&!t.chartImageUrl?"link":"image"} size={12}/></span>}</span>
      {compact ? <><SetupCell setup={t.setup} tags={t.tags} compact/><PnlCell trade={t} currency={currency}/></> : <><PnlCell trade={t} currency={currency}/><SidePill side={t.direction}/><SetupCell setup={t.setup} tags={t.tags}/><Rating value={t.rating}/></>}
      <span title={reviewed ? t.notes??undefined : "Open this trade to add review notes"} className={`flex items-center gap-1.5 text-[10px] ${reviewed ? "text-up" : "text-muted"}`}><Icon name={reviewed ? "checkCircle" : "pen"} size={12}/>{reviewed ? "Reviewed" : "Add notes"}</span><Icon name="chevron" size={13} className="text-line-2 transition-colors group-hover:text-brand"/>
    </Link></li>;
  })}</ul></div>{!compact && <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[10px] text-muted"><span>{trades.length} {trades.length===1?"trade":"trades"}</span><span>Click a trade to see the story behind it<Icon name="arrow" size={11} className="ml-1.5 inline"/></span></div>}</div>;
}

function PnlCell({ trade, currency }: { trade: Trade; currency: string }) {
  const r = tradeR(trade);
  return <span className="text-right text-xs font-medium"><Pnl value={trade.pnl} currency={currency}/><span className={`mt-0.5 block text-[9px] font-normal ${r===null?"text-dim":"text-muted"}`}>{r===null?"No R":fmtR(r)}</span></span>;
}

function SetupCell({ setup, tags, compact = false }: { setup: string | null; tags?: TradeTag[]; compact?: boolean }) {
  return <span className="min-w-0">
    <span className={`block truncate ${compact?"text-[11px]":"text-xs"} text-muted`}>{setup??"—"}</span>
    {tags&&tags.length>0&&<span className="mt-0.5 block truncate text-[9px] text-dim">{tags.slice(0,2).map((tag)=>tag.name).join(" · ")}{tags.length>2?` +${tags.length-2}`:""}</span>}
  </span>;
}
