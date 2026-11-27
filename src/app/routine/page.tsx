import Link from "next/link";
import type { ReactNode } from "react";
import { deleteTradingRule, toggleTradingRule } from "@/app/routine-actions";
import { DeleteButton } from "@/components/delete-button";
import { Icon } from "@/components/icons";
import { RoutineHeatmap } from "@/components/routine-heatmap";
import { RoutinePlanForm, RoutineReviewForm, RuleCreateForm } from "@/components/routine-forms";
import { RoutineRuleList } from "@/components/routine-rule-list";
import { PageTitle } from "@/components/ui";
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

function InlineStat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-[0.1em] text-dim">{label}</p>
      <p className="mt-1 text-xs font-medium">{value}</p>
      {hint && <p className="mt-0.5 text-[10px] text-muted">{hint}</p>}
    </div>
  );
}

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
        title="Routine"
        subtitle="Your checklist, plan and review — one day at a time."
        action={
          <div className="flex items-center gap-2">
            {!isToday && (
              <Link href="/routine" className="text-link text-[11px]">
                Back to today
              </Link>
            )}
            <div className="flex items-center rounded-lg border border-line-2 bg-white p-0.5">
              <Link
                href={`/routine?date=${dayKey(previous)}`}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-panel-2 hover:text-fg"
                aria-label="Previous day"
              >
                <Icon name="chevron" size={14} className="rotate-180" />
              </Link>
              <span className="min-w-[104px] px-2 text-center text-[11px] font-medium">
                {isToday ? "Today" : fmtDate(selected)}
              </span>
              <Link
                href={`/routine?date=${dayKey(next)}`}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-panel-2 hover:text-fg"
                aria-label="Next day"
              >
                <Icon name="chevron" size={14} />
              </Link>
            </div>
          </div>
        }
      />

      <div className="space-y-5">
        {(sp.saved === "plan" || sp.saved === "review") && (
          <p
            role="status"
            className="flex items-center gap-2 border-l-2 border-up pl-3 text-xs text-up"
          >
            <Icon name="checkCircle" size={14} />
            {sp.saved === "plan" ? "Plan saved." : "Review saved."}
          </p>
        )}

        {/* -------------------------------- progress -------------------------------- */}
        <section className="card px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-10 gap-y-5">
            <div className="min-w-[240px] flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs font-semibold">
                  {isToday ? "Today’s checklist" : fmtDate(selected)}
                </span>
                <span className="num text-[11px] text-muted">
                  {progress.done} of {progress.total}
                </span>
              </div>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-panel-2">
                <div className="h-full rounded-full bg-brand" style={{ width: `${progress.pct}%` }} />
              </div>
              <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[10px] text-muted">
                {progress.byStage.map((stage) => (
                  <span key={stage.stage}>
                    {STAGE_LABEL[stage.stage]}{" "}
                    <span className="num text-fg">
                      {stage.done}/{stage.total}
                    </span>
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-10 gap-y-5">
              <InlineStat label="Streak" value={`${streak} ${streak === 1 ? "day" : "days"}`} hint={`best ${best}`} />
              <InlineStat label="30 days" value={fmtPct(consistency.pct, 0)} hint="rule completion" />
              <InlineStat
                label="Plan"
                value={planSaved ? "Saved" : "Not set"}
                hint={planSaved ? undefined : "before the session"}
              />
              <InlineStat
                label="Review"
                value={reviewSaved ? "Done" : "Pending"}
                hint={reviewSaved ? undefined : "after the close"}
              />
            </div>
          </div>
        </section>

        {/* ------------------------ checklist + plan and review ---------------------- */}
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
              <h2 className="text-xs font-semibold">Checklist</h2>
              <span className="num text-[10px] text-muted">
                {progress.done}/{progress.total}
              </span>
            </div>
            <div className="space-y-6 p-5">
              {RULE_STAGES.map((stage) => {
                const rules = activeRules.filter((rule) => rule.stage === stage);
                const stageProgress = progress.byStage.find((entry) => entry.stage === stage);
                return (
                  <section key={stage}>
                    <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                        {STAGE_LABEL[stage]}
                      </h3>
                      <span className="num text-[10px] text-dim">
                        {stageProgress?.done ?? 0}/{stageProgress?.total ?? 0}
                      </span>
                    </div>
                    <div className="mt-2.5">
                      <RoutineRuleList key={checkedKey} rules={rules} checkedIds={routine.checkedIds} planDate={key} />
                    </div>
                  </section>
                );
              })}
            </div>
          </section>

          <div className="space-y-5">
            <RoutinePlanForm plan={routine.plan} planDate={key} />
            <RoutineReviewForm plan={routine.plan} planDate={key} />
          </div>
        </div>

        {/* --------------------------- consistency + rules -------------------------- */}
        <div className="grid items-start gap-5 xl:grid-cols-2">
          <section className="card p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xs font-semibold">Consistency</h2>
              <span className="text-[10px] text-muted">Last 12 weeks</span>
            </div>
            <div className="mb-5 grid grid-cols-3 gap-4 border-b border-line pb-5">
              <InlineStat label="Perfect days" value={consistency.perfectDays} />
              <InlineStat label="Active days" value={consistency.activeDays} />
              <InlineStat label="Completion" value={fmtPct(consistency.pct, 0)} />
            </div>
            <RoutineHeatmap days={heatmap} />
          </section>

          <details className="card group overflow-hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 [&::-webkit-details-marker]:hidden">
              <span className="text-xs font-semibold">Rules</span>
              <span className="flex items-center gap-2 text-[10px] text-muted">
                {progress.total} active
                <Icon name="chevron" size={13} className="transition-transform group-open:rotate-90" />
              </span>
            </summary>
            <div className="grid gap-5 border-t border-line p-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
              <div className="space-y-5">
                {RULE_STAGES.map((stage) => {
                  const rules = routine.rules.filter((rule) => rule.stage === stage);
                  return (
                    <section key={stage}>
                      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                        {STAGE_LABEL[stage]}
                      </h3>
                      {rules.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-line-2 px-3 py-3 text-[11px] text-muted">
                          No rules in this stage yet.
                        </p>
                      ) : (
                        <ul className="divide-y divide-line rounded-lg border border-line">
                          {rules.map((rule) => (
                            <li key={rule.id} className={`flex items-center gap-3 px-3 py-2.5 ${rule.active ? "" : "opacity-55"}`}>
                              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${rule.active ? "bg-brand" : "bg-line-2"}`} />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[11px] font-medium">{rule.title}</p>
                                {rule.description && <p className="mt-0.5 truncate text-[10px] text-muted">{rule.description}</p>}
                              </div>
                              <form action={toggleTradingRule.bind(null, rule.id)}>
                                <button
                                  type="submit"
                                  className="rounded-md px-2 py-1 text-[10px] font-medium text-muted transition-colors hover:bg-panel-2 hover:text-fg"
                                >
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
                    </section>
                  );
                })}
              </div>
              <div>
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">Add a rule</h3>
                <RuleCreateForm planDate={key} />
                <p className="mt-3 text-[10px] leading-relaxed text-muted">
                  Rules apply to every routine day. Pausing keeps the history, deleting removes it.
                </p>
              </div>
            </div>
          </details>
        </div>
      </div>
    </>
  );
}
