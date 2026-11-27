"use client";

import { useState, useTransition } from "react";
import type { TradingRule } from "@/db/schema";
import { toggleDailyRule } from "@/app/routine-actions";
import { Icon } from "./icons";

export function RoutineRuleList({
  rules,
  checkedIds,
  planDate,
}: {
  rules: TradingRule[];
  checkedIds: number[];
  planDate: string;
}) {
  // The parent remounts this list (via key) when the saved checks change, so
  // the optimistic local state always starts from the server's truth.
  const [checked, setChecked] = useState<Set<number>>(() => new Set(checkedIds));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (rules.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line-2 px-4 py-5 text-center text-xs text-muted">
        No rules in this stage yet. Add one below to start tracking it.
      </p>
    );
  }

  const toggle = (ruleId: number) => {
    const previous = checked;
    const next = new Set(checked);
    if (next.has(ruleId)) next.delete(ruleId);
    else next.add(ruleId);
    setChecked(next);
    setError(null);
    startTransition(async () => {
      const result = await toggleDailyRule(ruleId, planDate, next.has(ruleId));
      if (!result.ok) {
        setChecked(previous);
        setError(result.error ?? "Could not save that check.");
      }
    });
  };

  return (
    <div className={pending ? "opacity-80" : ""}>
      <ul className="space-y-2">
        {rules.map((rule) => {
          const on = checked.has(rule.id);
          return (
            <li key={rule.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(rule.id)}
                className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  on ? "border-up/20 bg-up/5" : "border-line bg-white hover:border-line-2 hover:bg-panel-2/40"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                    on ? "border-up/30 bg-up text-white" : "border-line-2 bg-white text-transparent"
                  }`}
                >
                  <Icon name="check" size={12} />
                </span>
                <span className="min-w-0">
                  <span className={`block text-xs font-medium ${on ? "text-muted line-through" : "text-fg"}`}>
                    {rule.title}
                  </span>
                  {rule.description && (
                    <span className="mt-0.5 block text-[10px] leading-relaxed text-muted">{rule.description}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="mt-2 text-[10px] text-down">{error}</p>}
    </div>
  );
}
