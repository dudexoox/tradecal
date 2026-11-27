import type { ReactNode } from "react";
import { fmtMoney, fmtPct, fmtR, pnlColor } from "@/lib/format";
import { SymbolLogo } from "./symbol-logo";

export type BreakdownRow = {
  label: string;
  pnl: number;
  trades: number;
  winRate: number;
  avgR?: number | null;
  logo?: string;
  dot?: string;
  hint?: string;
};

export function ReportBreakdown({
  title,
  rows,
  currency,
  empty = "No trades in this period.",
  action,
  note,
}: {
  title: string;
  rows: BreakdownRow[];
  currency: string;
  empty?: string;
  action?: ReactNode;
  note?: string;
}) {
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.pnl)));
  return (
    <section className="card p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="chart-title">{title}</h2>
        {action}
      </div>
      {note && <p className="mb-4 text-[10px] text-muted">{note}</p>}
      {!note && <div className="mb-4" />}
      {rows.length === 0 ? (
        <p className="text-xs text-muted">{empty}</p>
      ) : (
        <div className="space-y-5">
          {rows.map((row) => (
            <div key={row.label}>
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="flex min-w-0 items-center gap-2 font-medium">
                  {row.logo && <SymbolLogo symbol={row.logo} size={16} />}
                  {row.dot && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.dot }} />}
                  <span className="truncate">{row.label}</span>
                </span>
                <span className={`num shrink-0 font-medium ${pnlColor(row.pnl)}`}>{fmtMoney(row.pnl, currency, 0)}</span>
              </div>
              {row.hint && <p className="mt-1 text-[10px] text-muted">{row.hint}</p>}
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel-2">
                <div
                  className={`h-full rounded-full ${row.pnl >= 0 ? "bg-brand/75" : "bg-down/65"}`}
                  style={{ width: `${Math.max(1, (Math.abs(row.pnl) / max) * 100)}%` }}
                />
              </div>
              <p className="mt-1.5 text-[10px] text-muted">
                {row.trades} {row.trades === 1 ? "trade" : "trades"} · {fmtPct(row.winRate, 0)} win rate
                {row.avgR !== undefined && (
                  <>
                    <span className="mx-1.5 text-line-2">·</span>
                    <span className="font-medium text-fg">{fmtR(row.avgR)}</span> avg
                  </>
                )}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
