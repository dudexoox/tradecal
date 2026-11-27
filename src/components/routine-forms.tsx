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
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 className="text-xs font-semibold">Pre-market plan</h2>
        {plan?.intention && <span className="text-[10px] text-muted">Saved</span>}
      </div>

      <div className="space-y-4 p-5">
        <div>
          <label className="label" htmlFor="intention">
            Intention
          </label>
          <textarea
            id="intention"
            name="intention"
            rows={2}
            defaultValue={plan?.intention ?? ""}
            placeholder="What kind of day is this?"
            className="field h-auto resize-y py-2.5 text-[13px] leading-relaxed"
          />
        </div>
        <div>
          <label className="label" htmlFor="marketBias">
            Bias & key levels
          </label>
          <textarea
            id="marketBias"
            name="marketBias"
            rows={3}
            defaultValue={plan?.marketBias ?? ""}
            placeholder="The higher-timeframe story and the levels that matter."
            className="field h-auto resize-y py-2.5 text-[13px] leading-relaxed"
          />
        </div>
        <div>
          <label className="label" htmlFor="watchlist">
            Watchlist
          </label>
          <input
            id="watchlist"
            name="watchlist"
            defaultValue={plan?.watchlist ?? ""}
            placeholder="EURUSD, XAUUSD, NAS100…"
            className="field"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="maxTrades">
              Max trades
            </label>
            <input
              id="maxTrades"
              name="maxTrades"
              type="number"
              min={0}
              max={100}
              step={1}
              inputMode="numeric"
              defaultValue={plan?.maxTrades ?? ""}
              placeholder="3"
              className="field num"
            />
          </div>
          <div>
            <label className="label" htmlFor="maxRiskPct">
              Max risk %
            </label>
            <input
              id="maxRiskPct"
              name="maxRiskPct"
              type="number"
              min={0}
              max={100}
              step="0.1"
              inputMode="decimal"
              defaultValue={plan?.maxRiskPct ?? ""}
              placeholder="1.5"
              className="field num"
            />
          </div>
        </div>
        {state?.error && (
          <p role="alert" className="rounded-lg bg-down/7 px-3 py-2 text-[11px] text-down">
            {state.error}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
        <span className="text-[10px] text-muted">Before the first candle</span>
        <button type="submit" disabled={pending} className="btn-primary h-9">
          <Icon name="check" size={14} />
          {pending ? "Saving…" : plan?.intention ? "Update plan" : "Save plan"}
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

      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 className="text-xs font-semibold">End-of-day review</h2>
        {plan?.review && <span className="text-[10px] text-muted">Saved</span>}
      </div>

      <div className="space-y-5 p-5">
        <div>
          <label className="label" htmlFor="review">
            How did the day go?
          </label>
          <textarea
            id="review"
            name="review"
            rows={4}
            defaultValue={plan?.review ?? ""}
            placeholder="What worked, what didn’t, and what you’ll carry into tomorrow."
            className="field h-auto resize-y py-2.5 text-[13px] leading-relaxed"
          />
        </div>
        <div>
          <span className="label">Rating</span>
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                aria-label={`${value} of 5`}
                aria-pressed={rating === value}
                onClick={() => setRating(rating === value ? 0 : value)}
                className={`h-9 w-9 rounded-lg border text-xs transition-colors ${
                  value <= rating
                    ? "border-brand/30 bg-brand/7 text-brand"
                    : "border-line-2 bg-white text-dim hover:border-brand/30"
                }`}
              >
                {value}
              </button>
            ))}
            {rating > 0 && <span className="ml-2 text-[10px] text-muted">{rating} / 5</span>}
          </div>
        </div>
        <div>
          <span className="label">Followed the plan?</span>
          <div className="grid h-10 grid-cols-2 gap-1 rounded-lg border border-line-2 bg-panel-2/60 p-1">
            {(["yes", "no"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={followed === value}
                onClick={() => setFollowed(followed === value ? "" : value)}
                className={`rounded-md text-xs font-medium transition-colors ${
                  followed === value ? "bg-white text-fg shadow-sm" : "text-muted hover:text-fg"
                }`}
              >
                {value === "yes" ? "Yes" : "No"}
              </button>
            ))}
          </div>
        </div>
        {state?.error && (
          <p role="alert" className="rounded-lg bg-down/7 px-3 py-2 text-[11px] text-down">
            {state.error}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
        <span className="text-[10px] text-muted">After the close</span>
        <button type="submit" disabled={pending} className="btn-primary h-9">
          <Icon name="check" size={14} />
          {pending ? "Saving…" : plan?.review ? "Update review" : "Save review"}
        </button>
      </div>
    </form>
  );
}

export function RuleCreateForm({ planDate }: { planDate: string }) {
  const [state, formAction, pending] = useActionState(saveTradingRule, null);
  return (
    <form action={formAction} className="rounded-lg border border-line p-4">
      <input type="hidden" name="planDate" value={planDate} />
      <div className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
        <div>
          <label className="label" htmlFor="stage">
            Stage
          </label>
          <select id="stage" name="stage" defaultValue="prepare" className="field">
            <option value="prepare">Prepare</option>
            <option value="trade">Trade</option>
            <option value="reflect">Reflect</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="title">
            Rule
          </label>
          <input
            id="title"
            name="title"
            required
            maxLength={120}
            placeholder="e.g. No trades in the first 5 minutes"
            className="field"
          />
        </div>
      </div>
      <div className="mt-3">
        <label className="label" htmlFor="description">
          Why it matters <span className="font-normal text-dim">(optional)</span>
        </label>
        <input
          id="description"
          name="description"
          maxLength={500}
          placeholder="A short reminder of the behaviour this protects."
          className="field"
        />
      </div>
      {state?.error && (
        <p role="alert" className="mt-3 rounded-lg bg-down/7 px-3 py-2 text-[11px] text-down">
          {state.error}
        </p>
      )}
      <div className="mt-3 flex justify-end">
        <button type="submit" disabled={pending} className="btn-ghost h-9">
          <Icon name="plus" size={14} />
          {pending ? "Adding…" : "Add rule"}
        </button>
      </div>
    </form>
  );
}
