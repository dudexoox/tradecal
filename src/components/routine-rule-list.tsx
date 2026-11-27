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
    return <p className="py-1 text-[11px] text-muted">No rules in this stage yet.</p>;
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
    <div className={pending ? "opacity-70" : ""}>
      <ul className="divide-y divide-line">
        {rules.map((rule) => {
          const on = checked.has(rule.id);
          return (
            <li key={rule.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(rule.id)}
                className="flex w-full items-start gap-3 py-2.5 text-left transition-opacity hover:opacity-75"
              >
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                    on ? "border-brand bg-brand text-white" : "border-line-2 bg-white text-transparent"
                  }`}
                >
                  <Icon name="check" size={10} />
                </span>
                <span className="min-w-0">
                  <span className={`block text-xs ${on ? "text-muted line-through" : "text-fg"}`}>{rule.title}</span>
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
