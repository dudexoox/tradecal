import type { GoalStatus } from "@/lib/goals";
import { fmtMoney, fmtPct } from "@/lib/format";
import { Icon } from "./icons";

const STATE_TONE: Record<GoalStatus["state"], { bar: string; text: string; label: string }> = {
  ok: { bar: "bg-brand/70", text: "text-brand", label: "On track" },
  warn: { bar: "bg-[#d99a2b]", text: "text-[#b07d17]", label: "Close to the limit" },
  breach: { bar: "bg-down", text: "text-down", label: "Breached" },
  hit: { bar: "bg-up", text: "text-up", label: "Target hit" },
};

export function GoalCard({
  status,
  currency,
  limitLabel = "Limit",
  usedLabel = "Used",
}: {
  status: GoalStatus;
  currency: string;
  limitLabel?: string;
  usedLabel?: string;
}) {
  const tone = STATE_TONE[status.state];
  const width = Math.min(100, status.pct);

  return (
    <section className="card px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold">{status.label}</p>
          <p className={`mt-1 text-[10px] ${tone.text}`}>{tone.label}</p>
        </div>
        <span className={`num shrink-0 text-[11px] font-medium ${tone.text}`}>
          {status.limit === null ? "—" : fmtPct(status.pct, 0)}
        </span>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-panel-2">
        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${width}%` }} />
      </div>

      <dl className="mt-3 space-y-1 text-[11px]">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted">{limitLabel}</dt>
          <dd className="num font-medium">{status.limit === null ? "—" : fmtMoney(status.limit, currency)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted">{usedLabel}</dt>
          <dd className="num font-medium">{fmtMoney(status.used, currency)}</dd>
        </div>
      </dl>

      <p className="mt-3 border-t border-line pt-2.5 text-[10px] leading-relaxed text-muted">{status.detail}</p>
      {status.note && (
        <p className={`mt-2 flex items-start gap-1.5 text-[10px] font-medium ${tone.text}`}>
          <Icon name="info" size={12} className="mt-px shrink-0" />
          {status.note}
        </p>
      )}
    </section>
  );
}
