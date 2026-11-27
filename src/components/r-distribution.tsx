import { fmtPct } from "@/lib/format";

export type RDistributionRow = {
  label: string;
  count: number;
  tone: "up" | "down" | "muted";
};

/** A compact histogram of realised R-multiples. */
export function RDistribution({ rows }: { rows: RDistributionRow[] }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const max = Math.max(1, ...rows.map((row) => row.count));
  if (total === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line-2 px-4 py-6 text-center text-xs text-muted">
        Add a stop loss or planned risk to a trade and its R-multiple will appear here.
      </p>
    );
  }
  return (
    <div className="space-y-2.5">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[78px_minmax(0,1fr)_54px] items-center gap-3">
          <span className="num text-right text-[10px] text-muted">{row.label}</span>
          <div className="h-5 overflow-hidden rounded-md bg-panel-2">
            <div
              className={`h-full rounded-md ${
                row.tone === "up" ? "bg-up/70" : row.tone === "down" ? "bg-down/70" : "bg-line-2"
              }`}
              style={{ width: `${Math.max(row.count > 0 ? 3 : 0, (row.count / max) * 100)}%` }}
            />
          </div>
          <span className="num text-[10px] text-muted">
            {row.count} <span className="text-dim">· {fmtPct(total ? (row.count / total) * 100 : 0, 0)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
