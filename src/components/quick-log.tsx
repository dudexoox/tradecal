"use client";

import { useActionState, useState } from "react";
import { quickLogTrade } from "@/app/actions";
import type { FormState } from "@/app/actions";
import { Icon } from "./icons";

export function QuickLog({
  accountId,
  defaultTime,
  symbols,
}: {
  accountId: number;
  defaultTime: string;
  symbols: string[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(quickLogTrade, null);
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"long" | "short">("long");
  /* Kept in state so a validation error never wipes what was typed. */
  const [fields, setFields] = useState({ symbol: "", pnl: "", risk: "", setup: "", closedAt: defaultTime });
  const set = (key: keyof typeof fields) => (value: string) =>
    setFields((current) => ({ ...current, [key]: value }));

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-2 bg-white px-3 text-[11px] font-medium text-muted transition-colors hover:border-brand/40 hover:text-brand"
      >
        <Icon name="sparkles" size={13} />
        Quick log
      </button>
    );
  }

  return (
    <form action={formAction} className="mb-4 rounded-xl border border-line bg-panel p-4 shadow-[0_2px_3px_#18243b02]">
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="direction" value={direction} />
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon name="sparkles" size={15} className="text-brand" />
          <h2 className="text-xs font-semibold">Quick log</h2>
          <span className="text-[10px] text-muted">Symbol, side and result — everything else later.</span>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="icon-button h-7 w-7" aria-label="Close quick log">
          <Icon name="plus" size={12} className="rotate-45" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div>
          <label className="label" htmlFor="quick-symbol">
            Symbol
          </label>
          <input
            id="quick-symbol"
            name="symbol"
            list="quick-symbols"
            required
            maxLength={20}
            placeholder="EURUSD"
            autoComplete="off"
            value={fields.symbol}
            onChange={(event) => set("symbol")(event.target.value.toUpperCase())}
            className="field h-9 uppercase text-xs placeholder:normal-case"
          />
          <datalist id="quick-symbols">
            {symbols.map((symbol) => (
              <option key={symbol} value={symbol} />
            ))}
          </datalist>
        </div>

        <div>
          <span className="label">Side</span>
          <div className="grid h-9 grid-cols-2 gap-1 rounded-lg border border-line-2 bg-panel-2/60 p-1">
            {(["long", "short"] as const).map((side) => (
              <button
                key={side}
                type="button"
                aria-pressed={direction === side}
                onClick={() => setDirection(side)}
                className={`rounded-md text-[11px] font-medium capitalize transition-colors ${
                  direction === side
                    ? side === "long"
                      ? "bg-white text-up shadow-sm"
                      : "bg-white text-down shadow-sm"
                    : "text-muted hover:text-fg"
                }`}
              >
                {side}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="quick-pnl">
            Net P&L
          </label>
          <input
            id="quick-pnl"
            name="pnl"
            type="number"
            step="any"
            inputMode="decimal"
            required
            placeholder="0.00"
            value={fields.pnl}
            onChange={(event) => set("pnl")(event.target.value)}
            className="field num h-9 text-xs"
          />
        </div>

        <div>
          <label className="label" htmlFor="quick-risk">
            Risk (1R)
          </label>
          <input
            id="quick-risk"
            name="riskAmount"
            type="number"
            step="any"
            inputMode="decimal"
            placeholder="250"
            value={fields.risk}
            onChange={(event) => set("risk")(event.target.value)}
            className="field num h-9 text-xs"
          />
        </div>

        <div>
          <label className="label" htmlFor="quick-setup">
            Setup
          </label>
          <input
            id="quick-setup"
            name="setup"
            maxLength={120}
            placeholder="Breakout"
            value={fields.setup}
            onChange={(event) => set("setup")(event.target.value)}
            className="field h-9 text-xs"
          />
        </div>

        <div>
          <label className="label" htmlFor="quick-time">
            Closed
          </label>
          <input
            id="quick-time"
            name="closedAt"
            type="datetime-local"
            value={fields.closedAt}
            onChange={(event) => set("closedAt")(event.target.value)}
            className="field num h-9 text-xs"
          />
        </div>
      </div>

      <input type="hidden" name="openedAt" value={defaultTime} />

      <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
        {state?.error && <span className="text-[11px] text-down">{state.error}</span>}
        <button type="submit" disabled={pending} className="btn-primary h-9">
          <Icon name="check" size={14} />
          {pending ? "Logging…" : "Log trade"}
        </button>
      </div>
    </form>
  );
}
