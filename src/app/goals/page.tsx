import Link from "next/link";
import { GoalCard } from "@/components/goal-card";
import { GoalsForm } from "@/components/goals-form";
import { Icon } from "@/components/icons";
import { Empty, PageTitle, Pnl, SectionTitle, Stat } from "@/components/ui";
import { getActiveAccount, getGoals, getTrades } from "@/lib/data";
import { fmtDateShort, fmtMoney, fmtPct } from "@/lib/format";
import { computeGoalStatus, goalWarnings, resolveGoals } from "@/lib/goals";
import { computeStats, effectiveTime } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const { account } = await getActiveAccount();
  if (!account)
    return (
      <Empty
        title="Set the rules before the money moves"
        body="Add an account and tradeCal will track your targets, loss limits and risk caps for you."
        action={{ href: "/accounts?new=1", label: "Add account" }}
      />
    );

  const [trades, goalRow] = await Promise.all([getTrades(account.id), getGoals(account.id)]);

  const goals = resolveGoals(account, goalRow);
  const statuses = computeGoalStatus(account, goals, trades);
  const warnings = goalWarnings(statuses);
  const stats = computeStats(account, trades);
  const currency = account.currency;

  const breaches = warnings.filter((warning) => warning.level === "breach");
  const closeCalls = warnings.filter((warning) => warning.level === "warn");

  const dailyBreachDays = stats.days.filter((day) => goals.dailyLossLimit > 0 && -day.pnl >= goals.dailyLossLimit);
  const riskBreaches = trades.filter((trade) => {
    if (trade.riskAmount === null || trade.riskAmount <= 0) return false;
    if (goals.maxRiskPerTrade !== null && trade.riskAmount > goals.maxRiskPerTrade) return true;
    const balance = account.startingBalance + stats.netPnl;
    const limitFromPct =
      goals.maxRiskPerTradePct !== null ? Math.round((balance * goals.maxRiskPerTradePct) / 100 * 100) / 100 : null;
    return limitFromPct !== null && trade.riskAmount > limitFromPct;
  });

  const todayStatus = statuses.find((status) => status.key === "dailyLoss");

  return (
    <>
      <PageTitle
        title="Goals & risk limits"
        subtitle={`The guardrails for ${account.name}. Rules first, results second.`}
        action={
          <Link href="/trades" className="btn-ghost">
            <Icon name="list" size={15} />
            Trade log
          </Link>
        }
      />

      <div className="space-y-5">
        {/* -------------------------------- status -------------------------------- */}
        <section
          className={`card flex flex-wrap items-center gap-4 px-5 py-4 ${
            breaches.length > 0 ? "border-down/25 bg-down/4" : closeCalls.length > 0 ? "border-[#e8c98a] bg-[#fdf8ec]" : ""
          }`}
        >
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              breaches.length > 0 ? "bg-down/10 text-down" : closeCalls.length > 0 ? "bg-[#f6e7c4] text-[#b07d17]" : "bg-up/8 text-up"
            }`}
          >
            <Icon name={breaches.length > 0 ? "info" : closeCalls.length > 0 ? "info" : "checkCircle"} size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">
              {breaches.length > 0
                ? `${breaches.length} ${breaches.length === 1 ? "limit has" : "limits have"} been breached`
                : closeCalls.length > 0
                  ? `${closeCalls.length} ${closeCalls.length === 1 ? "limit is" : "limits are"} close to being reached`
                  : "Every guardrail is intact"}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              {breaches.length > 0
                ? breaches.map((warning) => `${warning.title}: ${warning.detail}`).join(" · ")
                : closeCalls.length > 0
                  ? closeCalls.map((warning) => `${warning.title} — ${warning.detail}`).join(" · ")
                  : "Targets and loss limits are being respected. Keep the plan doing the work."}
            </p>
          </div>
          <Link href="/goals#limits" className="text-link shrink-0 text-[11px]">
            Adjust limits<Icon name="arrow" size={12} />
          </Link>
        </section>

        {/* -------------------------------- metrics ------------------------------- */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat
            label="Net P&L"
            value={<Pnl value={stats.netPnl} currency={currency} />}
            hint={`${fmtPct(stats.returnPct, 1)} on ${fmtMoney(account.startingBalance, currency, 0)}`}
          />
          <Stat
            label="Profit target"
            value={fmtMoney(goals.profitTarget, currency, 0)}
            hint={
              goals.profitTarget > 0
                ? `${Math.max(0, Math.round((stats.netPnl / goals.profitTarget) * 100))}% earned`
                : "No target set"
            }
            tone={stats.netPnl >= goals.profitTarget && goals.profitTarget > 0 ? "up" : "default"}
          />
          <Stat
            label="Today's loss used"
            value={fmtMoney(todayStatus?.used ?? 0, currency, 0)}
            hint={`Limit ${fmtMoney(goals.dailyLossLimit, currency, 0)}`}
            tone={(todayStatus?.state === "breach" ? "down" : "default") as "down" | "default"}
          />
          <Stat
            label="Risk breaches"
            value={riskBreaches.length}
            hint={riskBreaches.length ? "Trades above the risk cap" : "Every trade inside the cap"}
            tone={riskBreaches.length ? "down" : "default"}
          />
        </div>

        {/* -------------------------------- cards --------------------------------- */}
        <section>
          <SectionTitle>Where you stand</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {statuses.map((status) => (
              <GoalCard
                key={status.key}
                status={status}
                currency={currency}
                limitLabel={status.key === "profitTarget" ? "Target" : "Limit"}
              />
            ))}
          </div>
        </section>

        {/* ------------------------------- breaches ------------------------------- */}
        {(dailyBreachDays.length > 0 || riskBreaches.length > 0) && (
          <section className="grid items-start gap-5 xl:grid-cols-2">
            {dailyBreachDays.length > 0 && (
              <div className="card overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
                  <h2 className="text-xs font-semibold">Days that broke the loss limit</h2>
                  <span className="num text-[10px] text-down">{dailyBreachDays.length}</span>
                </div>
                <ul className="divide-y divide-line">
                  {dailyBreachDays.map((day) => (
                    <li key={day.key} className="flex items-center justify-between gap-3 px-5 py-3">
                      <Link href={`/day-view?date=${day.key}`} className="text-xs font-medium hover:text-brand">
                        {fmtDateShort(day.date)}
                      </Link>
                      <span className="flex items-center gap-4">
                        <span className="num text-[10px] text-muted">{day.trades} trades</span>
                        <span className="num text-xs font-medium text-down">
                          {fmtMoney(day.pnl, currency)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {riskBreaches.length > 0 && (
              <div className="card overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
                  <h2 className="text-xs font-semibold">Trades above the risk cap</h2>
                  <span className="num text-[10px] text-down">{riskBreaches.length}</span>
                </div>
                <ul className="divide-y divide-line">
                  {riskBreaches.slice(0, 8).map((trade) => (
                    <li key={trade.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <Link href={`/trades/${trade.id}`} className="flex min-w-0 items-center gap-2 text-xs font-medium hover:text-brand">
                        <span className="truncate">{trade.symbol}</span>
                        <span className="text-[10px] font-normal capitalize text-muted">{trade.direction}</span>
                        <span className="num text-[10px] font-normal text-dim">
                          {fmtDateShort(effectiveTime(trade))}
                        </span>
                      </Link>
                      <span className="num shrink-0 text-xs font-medium text-down">
                        {fmtMoney(trade.riskAmount ?? 0, currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* -------------------------------- limits -------------------------------- */}
        <section id="limits">
          <SectionTitle>Your limits</SectionTitle>
          <GoalsForm
            accountId={account.id}
            currency={currency}
            goals={goalRow}
            accountFallbacks={{
              profitTarget: Math.round((account.startingBalance * account.profitTargetPct) / 100),
              dailyLossLimit: Math.round((account.startingBalance * account.maxDailyLossPct) / 100),
              maxLossLimit: Math.round((account.startingBalance * account.maxLossPct) / 100),
            }}
          />
        </section>
      </div>
    </>
  );
}
