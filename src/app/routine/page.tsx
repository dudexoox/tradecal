import Link from "next/link";
import { deleteTradingRule, toggleTradingRule } from "@/app/routine-actions";
import { DeleteButton } from "@/components/delete-button";
import { Icon } from "@/components/icons";
import { ProgressRing } from "@/components/progress-ring";
import { RoutineHeatmap } from "@/components/routine-heatmap";
import { RoutinePlanForm, RoutineReviewForm, RuleCreateForm } from "@/components/routine-forms";
import { RoutineRuleList } from "@/components/routine-rule-list";
import { PageTitle, SectionTitle } from "@/components/ui";
import { RULE_STAGES, type RuleStage } from "@/db/schema";
import { getRoutineDay, getRoutineHistory } from "@/lib/data";
import { dayKey, fmtDate, fmtPct } from "@/lib/format";
import { parseDay } from "@/lib/period";
import {
  routineBestStreak,
  routineConsistency,
  routineHeatmap,
  routineProgress,
  routineStreak,
} from "@/lib/routine";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<RuleStage, string> = {
  prepare: "Prepare",
  trade: "Trade",
  reflect: "Reflect",
};

const STAGE_HINT: Record<RuleStage, string> = {
  prepare: "Before the first candle",
  trade: "While the session is live",
  reflect: "After the close",
};

export default async function RoutinePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; saved?: string; rules?: string }>;
}) {
  const sp = await searchParams;
  const today = new Date();
  const selected = parseDay(sp.date) ?? today;
  const key = dayKey(selected);
  const isToday = key === dayKey(today);

  const from = new Date(today);
  from.setDate(from.getDate() - 365);
  const [routine, history] = await Promise.all([getRoutineDay(key), getRoutineHistory(dayKey(from))]);

  const progress = routineProgress(routine.rules, routine.checkedIds);
  const streak = routineStreak(history, progress.total, today);
  const best = routineBestStreak(history, progress.total);
  const consistency = routineConsistency(history, progress.total, 30, today);
  const heatmap = routineHeatmap(history, progress.total, 12, today);

  const previous = new Date(selected);
  previous.setDate(previous.getDate() - 1);
  const next = new Date(selected);
  next.setDate(next.getDate() + 1);

  const planSaved = Boolean(
    (routine.plan?.intention ?? "").trim() ||
      (routine.plan?.marketBias ?? "").trim() ||
      (routine.plan?.watchlist ?? "").trim(),
  );
  // Remounts the checklists whenever the saved checks change on the server.
  const checkedKey = [...routine.checkedIds].sort((a, b) => a - b).join(",");
  const reviewSaved = Boolean((routine.plan?.review ?? "").trim() || (routine.plan?.rating ?? null) !== null);
  const activeRules = progress.active;

  return (
    <>
      <PageTitle
        title="Start My Day"
        subtitle="A repeatable routine turns good intentions into a process you can measure."
        action={
          <div className="flex items-center gap-2">
            <Link href={`/routine?date=${dayKey(previous)}`} className="icon-button border border-line" aria-label="Previous day">
              <Icon name="chevron" size={15} className="rotate-180" />
            </Link>
            <Link href="/routine" className={`btn-ghost h-10 ${isToday ? "border-brand/30 text-brand" : ""}`}>
              Today
            </Link>
            <Link href={`/routine?date=${dayKey(next)}`} className="icon-button border border-line" aria-label="Next day">
              <Icon name="chevron" size={15} />
            </Link>
          </div>
        }
      />

      <div className="space-y-5">
        {(sp.saved === "plan" || sp.saved === "review") && (
          <p role="status" className="flex items-center gap-2 rounded-lg bg-up/7 px-4 py-3 text-xs text-up">
            <Icon name="checkCircle" size={15} />
            {sp.saved === "plan" ? "Your pre-market plan is saved." : "Your end-of-day review is saved."}
          </p>
        )}

        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <p className="section-eyebrow mb-1.5">{isToday ? "Today's routine" : "Routine for this day"}</p>
              <h2 className="text-sm font-semibold tracking-[-0.2px]">{fmtDate(selected)}</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`subtle-tag ${planSaved ? "border-brand/20 bg-brand/5 text-brand" : ""}`}>
                <Icon name={planSaved ? "checkCircle" : "flag"} size={12} />
                {planSaved ? "Plan saved" : "No plan yet"}
              </span>
              <span className={`subtle-tag ${reviewSaved ? "border-up/20 bg-up/5 text-up" : ""}`}>
                <Icon name={reviewSaved ? "checkCircle" : "notebook"} size={12} />
                {reviewSaved ? "Day reviewed" : "Review pending"}
              </span>
            </div>
          </div>

          <div className="grid gap-5 p-5 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
            <div className="flex items-center gap-4">
              <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
                <ProgressRing value={progress.pct} size={96} stroke={9} />
                <span className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="num text-xl font-semibold tracking-[-0.6px]">{Math.round(progress.pct)}%</span>
                  <span className="text-[9px] text-muted">complete</span>
                </span>
              </div>
              <div>
                <p className="text-sm font-semibold">{progress.done} of {progress.total} rules</p>
                <p className="mt-1 max-w-[220px] text-[11px] leading-relaxed text-muted">
                  {progress.total === 0
                    ? "Add a rule below to start building your routine."
                    : progress.done === progress.total
                      ? "Every rule checked. That is a complete day."
                      : `${progress.total - progress.done} still to go. One check at a time.`}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-line bg-panel-2/40 px-3 py-3">
                <p className="text-[9px] uppercase tracking-[0.1em] text-dim">Streak</p>
                <p className="num mt-1.5 text-xl font-semibold tracking-[-0.5px]">{streak}<span className="ml-1 text-[10px] font-normal text-muted">days</span></p>
              </div>
              <div className="rounded-lg border border-line bg-panel-2/40 px-3 py-3">
                <p className="text-[9px] uppercase tracking-[0.1em] text-dim">Best streak</p>
                <p className="num mt-1.5 text-xl font-semibold tracking-[-0.5px]">{best}<span className="ml-1 text-[10px] font-normal text-muted">days</span></p>
              </div>
              <div className="rounded-lg border border-line bg-panel-2/40 px-3 py-3">
                <p className="text-[9px] uppercase tracking-[0.1em] text-dim">Last 30 days</p>
                <p className="num mt-1.5 text-xl font-semibold tracking-[-0.5px]">{fmtPct(consistency.pct, 0)}</p>
                <p className="mt-0.5 text-[9px] text-muted">trading days</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 border-t border-line px-5 py-4 sm:grid-cols-3">
            {progress.byStage.map((stage) => (
              <div key={stage.stage}>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-medium text-fg">{STAGE_LABEL[stage.stage]}</span>
                  <span className="num text-muted">{stage.done}/{stage.total}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-panel-2">
                  <div className="h-full rounded-full bg-brand/75" style={{ width: `${stage.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <section className="card overflow-hidden">
            <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
              <Icon name="checkCircle" size={17} className="text-brand" />
              <div>
                <h2 className="text-sm font-semibold">Today&apos;s checklist</h2>
                <p className="mt-0.5 text-[11px] text-muted">Tick each rule as you live it, not after the fact.</p>
              </div>
            </div>
            <div className="space-y-5 p-5">
              {RULE_STAGES.map((stage) => {
                const rules = activeRules.filter((rule) => rule.stage === stage);
                return (
                  <div key={stage}>
                    <div className="mb-2.5 flex items-baseline justify-between gap-2">
                      <h3 className="text-xs font-semibold">{STAGE_LABEL[stage]}</h3>
                      <span className="text-[10px] text-muted">{STAGE_HINT[stage]}</span>
                    </div>
                    <RoutineRuleList key={checkedKey} rules={rules} checkedIds={routine.checkedIds} planDate={key} />
                  </div>
                );
              })}
            </div>
          </section>

          <div className="space-y-5">
            <section className="card p-5">
              <SectionTitle>Consistency</SectionTitle>
              <div className="mb-5 grid grid-cols-3 gap-3">
                <div>
                  <p className="num text-xl font-semibold tracking-[-0.5px]">{consistency.perfectDays}</p>
                  <p className="mt-1 text-[10px] text-muted">Perfect days</p>
                </div>
                <div>
                  <p className="num text-xl font-semibold tracking-[-0.5px]">{consistency.activeDays}</p>
                  <p className="mt-1 text-[10px] text-muted">Active days</p>
                </div>
                <div>
                  <p className="num text-xl font-semibold tracking-[-0.5px]">{fmtPct(consistency.pct, 0)}</p>
                  <p className="mt-1 text-[10px] text-muted">Rule completion</p>
                </div>
              </div>
              <p className="mb-5 text-[10px] text-muted">
                Averaged over {consistency.days} trading days in the last 30 days.
              </p>
              <RoutineHeatmap days={heatmap} />
            </section>

            <section className="rounded-xl border border-[#deebfc] bg-[#eef6ff] p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white text-brand shadow-[0_2px_4px_#0781fe08]">
                  <Icon name="sparkles" size={17} />
                </span>
                <div>
                  <h2 className="text-sm font-semibold tracking-[-0.2px]">The routine is the edge.</h2>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-[#7891ac]">
                    You do not need to predict the market. You need to show up the same way, day after day, and let the process do the work.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>

        <div className="grid items-start gap-5 xl:grid-cols-2">
          <RoutinePlanForm plan={routine.plan} planDate={key} />
          <RoutineReviewForm plan={routine.plan} planDate={key} />
        </div>

        <section id="rules" className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div className="flex items-center gap-2.5">
              <Icon name="settings" size={17} className="text-brand" />
              <div>
                <h2 className="text-sm font-semibold">My trading rules</h2>
                <p className="mt-0.5 text-[11px] text-muted">Pause a rule without deleting it, or add one that fits your process.</p>
              </div>
            </div>
            <span className="subtle-tag">{progress.total} active</span>
          </div>
          <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <div className="space-y-5">
              {RULE_STAGES.map((stage) => {
                const rules = routine.rules.filter((rule) => rule.stage === stage);
                return (
                  <div key={stage}>
                    <h3 className="mb-2.5 text-xs font-semibold">{STAGE_LABEL[stage]}</h3>
                    {rules.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-line-2 px-3 py-3 text-[11px] text-muted">
                        No rules in this stage yet.
                      </p>
                    ) : (
                      <ul className="divide-y divide-line rounded-lg border border-line">
                        {rules.map((rule) => (
                          <li key={rule.id} className={`flex items-center gap-3 px-3 py-2.5 ${rule.active ? "" : "opacity-55"}`}>
                            <span className={`h-2 w-2 shrink-0 rounded-full ${rule.active ? "bg-up" : "bg-line-2"}`} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[11px] font-medium">{rule.title}</p>
                              {rule.description && <p className="mt-0.5 truncate text-[9px] text-muted">{rule.description}</p>}
                            </div>
                            <form action={toggleTradingRule.bind(null, rule.id)}>
                              <button type="submit" className="rounded-md px-2 py-1 text-[10px] font-medium text-muted transition-colors hover:bg-panel-2 hover:text-fg">
                                {rule.active ? "Pause" : "Resume"}
                              </button>
                            </form>
                            <DeleteButton
                              action={deleteTradingRule.bind(null, rule.id)}
                              label="Delete"
                              confirmText={`Delete the rule “${rule.title}”? Its daily checks will be removed too.`}
                              className="rounded-md px-2 py-1 text-[10px] font-medium text-muted transition-colors hover:bg-down/10 hover:text-down"
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
            <div>
              <h3 className="mb-2.5 text-xs font-semibold">Add a rule</h3>
              <RuleCreateForm planDate={key} />
              <p className="mt-3 text-[10px] leading-relaxed text-muted">
                Rules are personal to your account. They appear on every future routine day, and past checks stay attached to the dates you completed them.
              </p>
            </div>
          </div>
        </section>

        <p className="flex items-center justify-center gap-1.5 pt-3 text-[10px] text-dim">
          <Icon name="book" size={12} />
          Small habits, repeated. That is how an edge becomes yours.
        </p>
      </div>
    </>
  );
}
