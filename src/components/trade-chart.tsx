"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";
import { TradeAnalyze, type TradeChartTrade } from "./trade-analyze";

/**
 * Opens the TradingView chart in a clean fullscreen overlay, so the trade
 * detail page stays focused on the journaling side of the trade.
 */
export function TradeChart({ trade }: { trade: TradeChartTrade }) {
  const [open, setOpen] = useState(false);

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
          aria-label={`${trade.symbol} TradingView chart`}
        >
          <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{trade.symbol}</p>
              <p className="text-[10px] text-muted">TradingView · market data by TradingView</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="icon-button" aria-label="Close chart">
              <Icon name="plus" size={16} className="rotate-45" />
            </button>
          </header>
          <div className="min-h-0 flex-1">
            <TradeAnalyze trade={trade} fullscreen />
          </div>
        </div>
      )}
    </>
  );
}
