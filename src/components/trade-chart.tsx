"use client";

import { useEffect, useState } from "react";
import type { ChartTradeMeta } from "@/lib/chart-workspace";
import { fmtDateTime, fmtSignedMoney } from "@/lib/format";
import { Icon } from "./icons";
import { SymbolLogo } from "./symbol-logo";
import { TradeAnalyze } from "./trade-analyze";
import { TradeChartWorkspace } from "./trade-chart-workspace";

/**
 * Opens the chart in a clean fullscreen overlay, so the trade detail page
 * stays focused on the journaling side of the trade. The replay workspace
 * shows the broker candles with the entry and exit marked; the TradingView
 * tab keeps the live chart with its drawing tools.
 */
export function TradeChart({ trade }: { trade: ChartTradeMeta }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"replay" | "tradingview">("replay");

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button type="button" className="btn-ghost" onClick={() => setOpen(true)}>
        <Icon name="chart" size={14} />
        Chart
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-white"
          role="dialog"
          aria-modal="true"
          aria-label={`${trade.symbol} chart`}
        >
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-3">
              <SymbolLogo symbol={trade.symbol} size={30} />
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate text-[13px] font-semibold">
                  {trade.symbol}
                  <span
                    className={`inline-flex h-[20px] items-center rounded-md px-1.5 text-[9px] font-medium capitalize ${
                      trade.direction === "long" ? "bg-up/8 text-up" : "bg-down/8 text-down"
                    }`}
                  >
                    {trade.direction}
                  </span>
                </p>
                <p className="num truncate text-[10px] text-muted">
                  {fmtDateTime(trade.openedAt)} UTC
                  {trade.closedAt ? ` → ${fmtDateTime(trade.closedAt)} UTC` : " · still open"}
                  {trade.accountName ? ` · ${trade.accountName}` : ""}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span
                className={`num hidden text-[13px] font-semibold sm:block ${
                  trade.pnl > 0 ? "text-up" : trade.pnl < 0 ? "text-down" : "text-fg"
                }`}
              >
                {fmtSignedMoney(trade.pnl, trade.currency)}
              </span>
              <div className="flex items-center gap-0.5 rounded-lg border border-line-2 bg-panel-2/60 p-0.5">
                <button
                  type="button"
                  onClick={() => setTab("replay")}
                  className={`h-7 rounded-md px-3 text-[11px] font-medium transition-colors ${
                    tab === "replay" ? "bg-white text-fg shadow-sm" : "text-muted hover:text-fg"
                  }`}
                >
                  Replay
                </button>
                <button
                  type="button"
                  onClick={() => setTab("tradingview")}
                  className={`h-7 rounded-md px-3 text-[11px] font-medium transition-colors ${
                    tab === "tradingview" ? "bg-white text-fg shadow-sm" : "text-muted hover:text-fg"
                  }`}
                >
                  TradingView
                </button>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="icon-button"
                aria-label="Close chart"
              >
                <Icon name="plus" size={16} className="rotate-45" />
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1">
            {tab === "replay" ? (
              <TradeChartWorkspace trade={trade} onOpenTradingView={() => setTab("tradingview")} />
            ) : (
              <TradeAnalyze trade={trade} fullscreen />
            )}
          </div>
        </div>
      )}
    </>
  );
}
