"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { Playbook, Strategy } from "@/db/schema";
import type { FormState } from "@/app/actions";
import { CriteriaBuilder } from "./criteria-builder";
import { Icon } from "./icons";

// Kept local so this client bundle never imports drizzle definitions.
const MARKETS = ["FX", "Indices", "Commodities", "Crypto", "Stocks"] as const;
const STATUSES = ["active", "testing", "archived"] as const;
const DIRECTIONS = ["both", "long", "short"] as const;
const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1H", "4H", "D1", "W1"];
const SESSIONS = ["Any", "Asia", "London", "New York", "Overlap"];

export function StrategyForm({
  action,
  strategy,
  playbooks,
  cancelHref,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  strategy?: Strategy;
  playbooks: Pick<Playbook, "id" | "name">[];
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [rating, setRating] = useState(strategy?.rating ?? 0);

  return (
    <form action={formAction} className="space-y-5">
      {/* ------------------------------------------------------------- basics */}
      <section className="card overflow-hidden">
        <div className="flex items-center gap-2.5 border-b border-line px-6 py-4">
          <Icon name="flag" size={17} className="text-brand" />
          <h2 className="text-sm font-semibold">{strategy ? "Strategy" : "New strategy"}</h2>
          <span className="ml-auto hidden text-[10px] text-muted sm:inline">Everything this playbook entry must describe.</span>
        </div>

        <div className="grid gap-5 p-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="name">Strategy name <span className="text-brand">*</span></label>
            <input id="name" name="name" required maxLength={80} defaultValue={strategy?.name ?? ""} placeholder="e.g. Asian Range Breakout" className="field" />
          </div>

          <div>
            <label className="label" htmlFor="playbookId">Playbook</label>
            <select id="playbookId" name="playbookId" defaultValue={strategy?.playbookId ?? ""} className="field">
              <option value="">No playbook (unfiled)</option>
              {playbooks.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="market">Market</label>
            <select id="market" name="market" defaultValue={strategy?.market ?? "FX"} className="field">
              {MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="timeframe">Timeframe</label>
            <select id="timeframe" name="timeframe" defaultValue={strategy?.timeframe ?? "15m"} className="field">
              {TIMEFRAMES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="session">Session</label>
            <select id="session" name="session" defaultValue={strategy?.session ?? "London"} className="field">
              {SESSIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="direction">Applies to</label>
            <select id="direction" name="direction" defaultValue={strategy?.direction ?? "both"} className="field capitalize">
              {DIRECTIONS.map((d) => <option key={d} value={d}>{d === "both" ? "Long & short" : d}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="risk">Risk &amp; target ratio</label>
            <input id="risk" name="risk" maxLength={60} defaultValue={strategy?.risk ?? ""} placeholder="0.5% per trade · R:R 1:2" className="field" />
          </div>

          <div className="sm:col-span-2 flex flex-wrap items-end gap-6 border-t border-line pt-5">
            <div>
              <label className="label" htmlFor="status">Status</label>
              <select id="status" name="status" defaultValue={strategy?.status ?? "testing"} className="field">
                {STATUSES.map((s) => <option key={s} value={s}>{s === "active" ? "Active" : s === "testing" ? "In testing" : "Archived"}</option>)}
              </select>
            </div>
            <div>
              <span className="label">Confidence</span>
              <input type="hidden" name="rating" value={rating || ""} />
              <div className="flex h-11 items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" aria-label={`${n} of 5`} aria-pressed={rating === n} onClick={() => setRating(rating === n ? 0 : n)}
                    className={`h-9 w-9 rounded-lg border text-xs transition-colors ${n <= rating ? "border-brand/30 bg-brand/7 text-brand" : "border-line-2 bg-white text-dim hover:border-brand/30"}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- the idea */}
      <section className="card p-6">
        <h3 className="mb-4 text-sm font-semibold">The idea</h3>
        <div className="space-y-5">
          <div>
            <label className="label" htmlFor="description">Describe the strategy in your own words</label>
            <textarea id="description" name="description" rows={3} defaultValue={strategy?.description ?? ""}
              placeholder="What is this strategy trying to exploit, and why does it exist?"
              className="field h-auto resize-y py-3 text-[13px] leading-relaxed" />
          </div>
          <div>
            <label className="label" htmlFor="howItWorks">How it has worked in practice</label>
            <textarea id="howItWorks" name="howItWorks" rows={4} defaultValue={strategy?.howItWorks ?? ""}
              placeholder="Walk through a typical trade from context to exit — what the market was doing and why this setup behaved as expected."
              className="field h-auto resize-y py-3 text-[13px] leading-relaxed" />
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- entry */}
      <section className="card p-6">
        <h3 className="mb-4 text-sm font-semibold">Where — and why — it enters</h3>
        <div className="space-y-5">
          <div>
            <label className="label" htmlFor="entryWhere">Where you enter</label>
            <textarea id="entryWhere" name="entryWhere" rows={3} defaultValue={strategy?.entryWhere ?? ""}
              placeholder="Exact location: level, retracement, trigger candle, confirmation…"
              className="field h-auto resize-y py-3 text-[13px] leading-relaxed" />
          </div>
          <div>
            <label className="label" htmlFor="entryWhy">Why it enters there (the reason behind the trade)</label>
            <textarea id="entryWhy" name="entryWhy" rows={3} defaultValue={strategy?.entryWhy ?? ""}
              placeholder="What makes that location worth money? Liquidity, imbalance, failed auction, displacement…"
              className="field h-auto resize-y py-3 text-[13px] leading-relaxed" />
          </div>
          <CriteriaBuilder
            name="entry_criteria"
            label="Entry checklist — conditions that must be true"
            hint="Each line becomes a checkable item whenever you review a trade against this strategy."
            placeholder="Add a condition, press Enter"
            defaultText={strategy?.entryCriteria ?? ""}
          />
        </div>
      </section>

      {/* -------------------------------------------------------------- skip */}
      <section className="card p-6">
        <h3 className="mb-4 text-sm font-semibold">When <em className="not-italic text-muted">not</em> to take it</h3>
        <div className="space-y-5">
          <CriteriaBuilder
            name="avoid_criteria"
            tone="down"
            label="Skip list — reasons to pass on the trade"
            hint="Market conditions, events or states that void the setup before you look at the entry."
            placeholder="Add a reason to skip, press Enter"
            defaultText={strategy?.avoidCriteria ?? ""}
          />
          <div>
            <label className="label" htmlFor="skipReasons">Criteria you deliberately drop — and why</label>
            <textarea id="skipReasons" name="skipReasons" rows={4} defaultValue={strategy?.skipReasons ?? ""}
              placeholder="Which textbook conditions does this strategy ignore? Explain the reason you removed them."
              className="field h-auto resize-y py-3 text-[13px] leading-relaxed" />
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- exit & risk */}
      <section className="card p-6">
        <h3 className="mb-4 text-sm font-semibold">Invalidation &amp; exit</h3>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="invalidation">What proves the idea wrong</label>
            <textarea id="invalidation" name="invalidation" rows={4} defaultValue={strategy?.invalidation ?? ""}
              placeholder="Stop placement, invalidating candle, time-based exit…"
              className="field h-auto resize-y py-3 text-[13px] leading-relaxed" />
          </div>
          <div>
            <label className="label" htmlFor="target">Target plan</label>
            <textarea id="target" name="target" rows={4} defaultValue={strategy?.target ?? ""}
              placeholder="Where you take profit, how you scale, how you trail…"
              className="field h-auto resize-y py-3 text-[13px] leading-relaxed" />
          </div>
        </div>
      </section>

      {state?.error && (
        <p role="alert" className="rounded-lg bg-down/8 px-3 py-2 text-xs text-down">{state.error}</p>
      )}

      <div className="flex items-center justify-end gap-2">
        <Link href={cancelHref} className="btn-ghost">Cancel</Link>
        <button type="submit" disabled={pending} className="btn-primary">
          <Icon name="check" size={15} />
          {pending ? "Saving…" : strategy ? "Save strategy" : "Create strategy"}
        </button>
      </div>
    </form>
  );
}
