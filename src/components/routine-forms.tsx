"use client";

import { useActionState, useState } from "react";
import type { DailyPlan } from "@/db/schema";
import { saveDailyPlan, saveDailyReview, saveTradingRule } from "@/app/routine-actions";
import { Icon } from "./icons";

export function RoutinePlanForm({ plan, planDate }: { plan: DailyPlan | null; planDate: string }) {
  const [state, formAction, pending] = useActionState(saveDailyPlan, null);
  return (
    <form action={formAction} id="plan" className="card overflow-hidden">
      <input type="hidden" name="planDate" value={planDate} />
      <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
        <Icon name="flag" size={17} className="text-brand" />
        <div>
          <h2 className="text-sm font-semibold">Pre-market plan</h2>
          <p className="mt-0.5 text-[11px] text-muted">Decide what kind of day this will be before the first candle.</p>
        </div>
      </div>
      <div className="space-y-4 p-5">
        <div>
          <label className="label" htmlFor="intention">Today&apos;s intention</label>
          <textarea id="intention" name="intention" rows={2} defaultValue={plan?.intention ?? ""} placeholder="e.g. Trade only the London open, take two A+ setups, then stop." className="field h-auto resize-y py-2.5 text-[13px] leading-relaxed" />
        </div>
        <div>
          <label className="label" htmlFor="marketBias">Bias &amp; key levels</label>
          <textarea id="marketBias" name="marketBias" rows={3} defaultValue={plan?.marketBias ?? ""} placeholder="What is the higher-timeframe story? Where are the levels that matter?" className="field h-auto resize-y py-2.5 text-[13px] leading-relaxed" />
        </div>
        <div>
          <label className="label" htmlFor="watchlist">Watchlist</label>
          <input id="watchlist" name="watchlist" defaultValue={plan?.watchlist ?? ""} placeholder="EURUSD, XAUUSD, NAS100…" className="field" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="maxTrades">Max trades</label>
            <input id="maxTrades" name="maxTrades" type="number" min={0} max={100} step={1} inputMode="numeric" defaultValue={plan?.maxTrades ?? ""} placeholder="3" className="field num" />
          </div>
          <div>
            <label className="label" htmlFor="maxRiskPct">Max risk %</label>
            <input id="maxRiskPct" name="maxRiskPct" type="number" min={0} max={100} step="0.1" inputMode="decimal" defaultValue={plan?.maxRiskPct ?? ""} placeholder="1.5" className="field num" />
          </div>
        </div>
        {state?.error && <p role="alert" className="rounded-lg bg-down/7 px-3 py-2 text-xs text-down">{state.error}</p>}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line bg-panel-2/30 px-5 py-3">
        <span className="text-[10px] text-muted">A plan you can measure the day against.</span>
        <button type="submit" disabled={pending} className="btn-primary h-9">
          <Icon name="check" size={14} />{pending ? "Saving…" : plan ? "Update plan" : "Save plan"}
        </button>
      </div>
    </form>
  );
}

export function RoutineReviewForm({ plan, planDate }: { plan: DailyPlan | null; planDate: string }) {
  const [state, formAction, pending] = useActionState(saveDailyReview, null);
  const [rating, setRating] = useState(plan?.rating ?? 0);
  const [followed, setFollowed] = useState<"" | "yes" | "no">(
    plan?.followedPlan === null || plan?.followedPlan === undefined ? "" : plan.followedPlan ? "yes" : "no",
  );
  return (
    <form action={formAction} id="review" className="card overflow-hidden">
      <input type="hidden" name="planDate" value={planDate} />
      <input type="hidden" name="rating" value={rating || ""} />
      <input type="hidden" name="followedPlan" value={followed} />
      <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
        <Icon name="notebook" size={17} className="text-brand" />
        <div>
          <h2 className="text-sm font-semibold">End-of-day review</h2>
          <p className="mt-0.5 text-[11px] text-muted">Close the loop while the session is still fresh.</p>
        </div>
      </div>
      <div className="space-y-5 p-5">
        <div>
          <label className="label" htmlFor="review">How did the day go?</label>
          <textarea id="review" name="review" rows={4} defaultValue={plan?.review ?? ""} placeholder="What worked? What didn't? Did you follow the plan you wrote this morning?" className="field h-auto resize-y py-2.5 text-[13px] leading-relaxed" />
        </div>
        <div>
          <span className="label">How would you rate the day?</span>
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                aria-label={`${value} of 5`}
                aria-pressed={rating === value}
                onClick={() => setRating(rating === value ? 0 : value)}
                className={`h-9 w-9 rounded-lg border text-xs transition-colors ${value <= rating ? "border-brand/30 bg-brand/7 text-brand" : "border-line-2 bg-white text-dim hover:border-brand/30"}`}
              >
                {value}
              </button>
            ))}
            {rating > 0 && <span className="ml-2 text-[10px] text-muted">{rating} / 5</span>}
          </div>
        </div>
        <div>
          <span className="label">Did you follow your plan?</span>
          <div className="grid h-10 grid-cols-2 gap-1 rounded-lg border border-line-2 bg-panel-2/60 p-1">
            {(["yes", "no"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={followed === value}
                onClick={() => setFollowed(followed === value ? "" : value)}
                className={`rounded-md text-xs font-medium capitalize transition-colors ${followed === value ? "bg-white text-fg shadow-sm" : "text-muted hover:text-fg"}`}
              >
                {value === "yes" ? "Yes — I stuck to it" : "No — I deviated"}
              </button>
            ))}
          </div>
        </div>
        {state?.error && <p role="alert" className="rounded-lg bg-down/7 px-3 py-2 text-xs text-down">{state.error}</p>}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line bg-panel-2/30 px-5 py-3">
        <span className="text-[10px] text-muted">Honest reviews compound faster than good trades.</span>
        <button type="submit" disabled={pending} className="btn-primary h-9">
          <Icon name="check" size={14} />{pending ? "Saving…" : plan?.review ? "Update review" : "Save review"}
        </button>
      </div>
    </form>
  );
}

export function RuleCreateForm({ planDate }: { planDate: string }) {
  const [state, formAction, pending] = useActionState(saveTradingRule, null);
  return (
    <form action={formAction} className="rounded-lg border border-line bg-panel-2/30 p-4">
      <input type="hidden" name="planDate" value={planDate} />
      <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
        <div>
          <label className="label" htmlFor="stage">Stage</label>
          <select id="stage" name="stage" defaultValue="prepare" className="field">
            <option value="prepare">Prepare</option>
            <option value="trade">Trade</option>
            <option value="reflect">Reflect</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="title">Rule</label>
          <input id="title" name="title" required maxLength={120} placeholder="e.g. No trades in the first 5 minutes" className="field" />
        </div>
      </div>
      <div className="mt-3">
        <label className="label" htmlFor="description">Why it matters <span className="font-normal text-dim">(optional)</span></label>
        <input id="description" name="description" maxLength={500} placeholder="A short reminder of the behaviour this protects." className="field" />
      </div>
      {state?.error && <p role="alert" className="mt-3 rounded-lg bg-down/7 px-3 py-2 text-xs text-down">{state.error}</p>}
      <div className="mt-3 flex justify-end">
        <button type="submit" disabled={pending} className="btn-ghost h-9">
          <Icon name="plus" size={14} />{pending ? "Adding…" : "Add rule"}
        </button>
      </div>
    </form>
  );
}
