"use client";

import { useActionState, useState } from "react";
import { saveGoals } from "@/app/goals-actions";
import type { FormState } from "@/app/actions";
import type { TradingGoal } from "@/db/schema";
import { Icon } from "./icons";

/** Every limit the trader can set, kept in one place. */
type LimitFields = {
  profitTarget: string;
  dailyLossLimit: string;
  maxLossLimit: string;
  maxRiskPerTrade: string;
  maxRiskPerTradePct: string;
  warnAtPct: string;
  maxTradesPerDay: string;
  maxOpenTrades: string;
};

function initial(goals: TradingGoal | null): LimitFields {
  return {
    profitTarget: goals?.profitTarget != null ? String(goals.profitTarget) : "",
    dailyLossLimit: goals?.dailyLossLimit != null ? String(goals.dailyLossLimit) : "",
    maxLossLimit: goals?.maxLossLimit != null ? String(goals.maxLossLimit) : "",
    maxRiskPerTrade: goals?.maxRiskPerTrade != null ? String(goals.maxRiskPerTrade) : "",
    maxRiskPerTradePct: goals?.maxRiskPerTradePct != null ? String(goals.maxRiskPerTradePct) : "",
    warnAtPct: String(goals?.warnAtPct ?? 80),
    maxTradesPerDay: goals?.maxTradesPerDay != null ? String(goals.maxTradesPerDay) : "",
    maxOpenTrades: goals?.maxOpenTrades != null ? String(goals.maxOpenTrades) : "",
  };
}

export function GoalsForm({
  accountId,
  currency,
  goals,
  accountFallbacks,
}: {
  accountId: number;
  currency: string;
  goals: TradingGoal | null;
  accountFallbacks: { profitTarget: number; dailyLossLimit: number; maxLossLimit: number };
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveGoals, null);
  /* Controlled so a rejected value never clears the whole form. */
  const [fields, setFields] = useState<LimitFields>(() => initial(goals));
  const set = (key: keyof LimitFields) => (value: string) =>
    setFields((current) => ({ ...current, [key]: value }));

  return (
    <form action={formAction} className="card overflow-hidden">
      <input type="hidden" name="accountId" value={accountId} />
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 className="text-xs font-semibold">Limits</h2>
        <span className="text-[10px] text-muted">Leave an amount blank to use the account objective</span>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <AmountField
            name="profitTarget"
            label="Profit target"
            currency={currency}
            value={fields.profitTarget}
            onChange={set("profitTarget")}
            fallback={`${accountFallbacks.profitTarget.toFixed(2)} from the account target`}
          />
          <AmountField
            name="dailyLossLimit"
            label="Daily loss limit"
            currency={currency}
            value={fields.dailyLossLimit}
            onChange={set("dailyLossLimit")}
            fallback={`${accountFallbacks.dailyLossLimit.toFixed(2)} from the account limit`}
          />
          <AmountField
            name="maxLossLimit"
            label="Total loss limit"
            currency={currency}
            value={fields.maxLossLimit}
            onChange={set("maxLossLimit")}
            fallback={`${accountFallbacks.maxLossLimit.toFixed(2)} from the account limit`}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <AmountField
            name="maxRiskPerTrade"
            label="Risk per trade"
            currency={currency}
            value={fields.maxRiskPerTrade}
            onChange={set("maxRiskPerTrade")}
          />
          <div>
            <label className="label" htmlFor="maxRiskPerTradePct">
              Risk per trade (%)
            </label>
            <input
              id="maxRiskPerTradePct"
              name="maxRiskPerTradePct"
              type="number"
              min={0}
              max={100}
              step="0.1"
              inputMode="decimal"
              value={fields.maxRiskPerTradePct}
              onChange={(event) => set("maxRiskPerTradePct")(event.target.value)}
              placeholder="1.0"
              className="field num"
            />
            <p className="mt-1.5 text-[10px] text-dim">Of the current balance</p>
          </div>
          <div>
            <label className="label" htmlFor="warnAtPct">
              Warn me at (%)
            </label>
            <input
              id="warnAtPct"
              name="warnAtPct"
              type="number"
              min={10}
              max={100}
              step={1}
              inputMode="numeric"
              value={fields.warnAtPct}
              onChange={(event) => set("warnAtPct")(event.target.value)}
              className="field num"
            />
            <p className="mt-1.5 text-[10px] text-dim">Warning threshold for every limit</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="maxTradesPerDay">
              Max trades per day
            </label>
            <input
              id="maxTradesPerDay"
              name="maxTradesPerDay"
              type="number"
              min={0}
              max={500}
              step={1}
              inputMode="numeric"
              value={fields.maxTradesPerDay}
              onChange={(event) => set("maxTradesPerDay")(event.target.value)}
              placeholder="3"
              className="field num"
            />
            <p className="mt-1.5 text-[10px] text-dim">Blank = no trade-count limit</p>
          </div>
          <div>
            <label className="label" htmlFor="maxOpenTrades">
              Max open trades
            </label>
            <input
              id="maxOpenTrades"
              name="maxOpenTrades"
              type="number"
              min={0}
              max={500}
              step={1}
              inputMode="numeric"
              value={fields.maxOpenTrades}
              onChange={(event) => set("maxOpenTrades")(event.target.value)}
              placeholder="2"
              className="field num"
            />
            <p className="mt-1.5 text-[10px] text-dim">Blank = no open-position limit</p>
          </div>
        </div>

        {state?.error && (
          <p role="alert" className="rounded-lg bg-down/7 px-3 py-2 text-[11px] text-down">
            {state.error}
          </p>
        )}
        {state?.ok && (
          <p role="status" className="flex items-center gap-2 rounded-lg bg-up/7 px-3 py-2 text-[11px] text-up">
            <Icon name="checkCircle" size={14} />
            Limits saved.
          </p>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-line px-5 py-3">
        <span className="text-[10px] text-muted">Applies to this account only</span>
        <button type="submit" disabled={pending} className="btn-primary h-9">
          <Icon name="check" size={14} />
          {pending ? "Saving…" : "Save limits"}
        </button>
      </div>
    </form>
  );
}

function AmountField({
  name,
  label,
  currency,
  value,
  onChange,
  fallback,
}: {
  name: string;
  label: string;
  currency: string;
  value: string;
  onChange: (value: string) => void;
  fallback?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="number"
        min={0}
        step="0.01"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="—"
        className="field num"
      />
      <p className="mt-1.5 text-[10px] text-dim">
        {fallback ? `${fallback}` : `Blank = no ${label.toLowerCase()} set`}
        <span className="ml-1 opacity-60">({currency})</span>
      </p>
    </div>
  );
}
