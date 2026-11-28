import Link from "next/link";
import { fmtMoney, fmtPct } from "@/lib/format";
import { Icon } from "./icons";

export function GoalsWidget({
  currency,
  netPnl,
  profitTarget,
  dailyUsed,
  dailyLimit,
  breaches,
}: {
  currency: string;
  netPnl: number;
  profitTarget: number;
  dailyUsed: number;
  dailyLimit: number;
  breaches: string[];
}) {
  const targetPct = profitTarget > 0 ? Math.min(100, Math.max(0, (netPnl / profitTarget) * 100)) : 0;
  const lossPct = dailyLimit > 0 ? Math.min(100, (dailyUsed / dailyLimit) * 100) : 0;
  const targetHit = profitTarget > 0 && netPnl >= profitTarget;

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-semibold">Guardrails</span>
        <Link href="/goals" className="text-link text-[10px]">
          Open<Icon name="arrow" size={11} />
        </Link>
      </div>

      {breaches.length > 0 ? (
        <p className="mb-3 flex items-start gap-2 rounded-lg bg-down/7 px-3 py-2 text-[10px] leading-relaxed text-down">
          <Icon name="info" size={12} className="mt-px shrink-0" />
          {breaches.join(" · ")}
        </p>
      ) : (
        <p className="mb-3 flex items-center gap-1.5 text-[10px] text-up">
          <Icon name="checkCircle" size={12} />
          Every limit is intact.
        </p>
      )}

      <div className="space-y-3">
        <div>
          <div className="flex items-baseline justify-between gap-2 text-[10px]">
            <span className="text-muted">Profit target</span>
            <span className="num text-fg">
              {targetHit ? "Hit" : fmtPct(targetPct, 0)}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-panel-2">
            <div className={`h-full rounded-full ${targetHit ? "bg-up" : "bg-brand/70"}`} style={{ width: `${targetPct}%` }} />
          </div>
          <p className="mt-1.5 text-[10px] text-dim">
            {fmtMoney(netPnl, currency, 0)} of {fmtMoney(profitTarget, currency, 0)}
          </p>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-2 text-[10px]">
            <span className="text-muted">Today&apos;s loss budget</span>
            <span className="num text-fg">{dailyLimit > 0 ? fmtPct(lossPct, 0) : "—"}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-panel-2">
            <div
              className={`h-full rounded-full ${lossPct >= 100 ? "bg-down" : lossPct >= 80 ? "bg-[#d99a2b]" : "bg-brand/40"}`}
              style={{ width: `${lossPct}%` }}
            />
          </div>
          <p className="mt-1.5 text-[10px] text-dim">
            {fmtMoney(dailyUsed, currency, 0)} of {fmtMoney(dailyLimit, currency, 0)} used
          </p>
        </div>
      </div>
    </section>
  );
}
