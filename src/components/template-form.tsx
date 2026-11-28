"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/app/actions";
import type { TradeTag, TradeTemplate } from "@/db/schema";
import { Icon } from "./icons";
import { TagPicker } from "./tag-picker";

/** The template fields, kept in state so a rejected save keeps the work. */
type TemplateFields = {
  name: string;
  symbol: string;
  entryPrice: string;
  stopLoss: string;
  takeProfit: string;
  riskAmount: string;
  size: string;
  setup: string;
  notes: string;
  strategyId: string;
};

function initial(template?: TradeTemplate): TemplateFields {
  const text = (value: number | null | undefined) => (value != null ? String(value) : "");
  return {
    name: template?.name ?? "",
    symbol: template?.symbol ?? "",
    entryPrice: text(template?.entryPrice),
    stopLoss: text(template?.stopLoss),
    takeProfit: text(template?.takeProfit),
    riskAmount: text(template?.riskAmount),
    size: text(template?.size),
    setup: template?.setup ?? "",
    notes: template?.notes ?? "",
    strategyId: template?.strategyId ? String(template.strategyId) : "",
  };
}

export function TemplateForm({
  action,
  template,
  allTags,
  strategies,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  template?: TradeTemplate;
  allTags: TradeTag[];
  strategies: { id: number; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, null);
  const [direction, setDirection] = useState<"long" | "short">(template?.direction ?? "long");
  const [fields, setFields] = useState<TemplateFields>(() => initial(template));
  const set = (key: keyof TemplateFields) => (value: string) =>
    setFields((current) => ({ ...current, [key]: value }));

  return (
    <form action={formAction} className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 className="text-xs font-semibold">{template ? "Edit template" : "New template"}</h2>
        <span className="text-[10px] text-muted">Everything except the result is pre-filled for you</span>
      </div>

      <div className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="template-name">
              Name <span className="text-brand">*</span>
            </label>
            <input
              id="template-name"
              name="name"
              required
              maxLength={80}
              value={fields.name}
              onChange={(event) => set("name")(event.target.value)}
              placeholder="e.g. London open breakout"
              className="field"
            />
          </div>
          <div>
            <label className="label" htmlFor="template-symbol">
              Symbol <span className="text-brand">*</span>
            </label>
            <input
              id="template-symbol"
              name="symbol"
              required
              maxLength={20}
              value={fields.symbol}
              onChange={(event) => set("symbol")(event.target.value.toUpperCase())}
              placeholder="EURUSD"
              autoComplete="off"
              className="field uppercase placeholder:normal-case"
            />
          </div>
        </div>

        <div>
          <span className="label">Direction</span>
          <div className="grid h-10 w-[200px] grid-cols-2 gap-1 rounded-lg border border-line-2 bg-panel-2/60 p-1">
            {(["long", "short"] as const).map((side) => (
              <button
                key={side}
                type="button"
                aria-pressed={direction === side}
                onClick={() => setDirection(side)}
                className={`rounded-md text-xs font-medium capitalize transition-colors ${
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
          <input type="hidden" name="direction" value={direction} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField name="entryPrice" label="Entry price" value={fields.entryPrice} onChange={set("entryPrice")} placeholder="1.0850" step="any" />
          <NumberField name="stopLoss" label="Stop loss" value={fields.stopLoss} onChange={set("stopLoss")} placeholder="1.0820" step="any" />
          <NumberField name="takeProfit" label="Take profit" value={fields.takeProfit} onChange={set("takeProfit")} placeholder="1.0920" step="any" />
          <NumberField name="riskAmount" label="Planned risk (1R)" value={fields.riskAmount} onChange={set("riskAmount")} placeholder="250" step="any" />
          <NumberField name="size" label="Size (lots)" value={fields.size} onChange={set("size")} placeholder="1.00" step="any" />
          <div>
            <label className="label" htmlFor="template-strategy">
              Strategy
            </label>
            <select
              id="template-strategy"
              name="strategyId"
              value={fields.strategyId}
              onChange={(event) => set("strategyId")(event.target.value)}
              className="field"
            >
              <option value="">No strategy linked</option>
              {strategies.map((strategy) => (
                <option key={strategy.id} value={strategy.id}>
                  {strategy.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="template-setup">
              Setup
            </label>
            <input
              id="template-setup"
              name="setup"
              maxLength={120}
              value={fields.setup}
              onChange={(event) => set("setup")(event.target.value)}
              placeholder="Breakout"
              className="field"
            />
          </div>
          <div>
            <span className="label">Tags</span>
            <TagPicker allTags={allTags} selected={template?.tags ?? []} />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="template-notes">
            Notes for this setup
          </label>
          <textarea
            id="template-notes"
            name="notes"
            rows={3}
            value={fields.notes}
            onChange={(event) => set("notes")(event.target.value)}
            placeholder="The conditions, the invalidation, what to watch for."
            className="field h-auto resize-y py-2.5 text-[13px] leading-relaxed"
          />
        </div>

        {state?.error && (
          <p role="alert" className="rounded-lg bg-down/7 px-3 py-2 text-[11px] text-down">
            {state.error}
          </p>
        )}
        {state?.ok && (
          <p role="status" className="flex items-center gap-2 rounded-lg bg-up/7 px-3 py-2 text-[11px] text-up">
            <Icon name="checkCircle" size={14} />
            Template saved.
          </p>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
        <button type="submit" disabled={pending} className="btn-primary h-9">
          <Icon name="check" size={14} />
          {pending ? "Saving…" : template ? "Save changes" : "Create template"}
        </button>
      </div>
    </form>
  );
}

function NumberField({
  name,
  label,
  value,
  onChange,
  placeholder,
  step = "any",
}: {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  step?: string;
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
        step={step}
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="field num"
      />
    </div>
  );
}
