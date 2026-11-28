"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import type { TradeTag } from "@/db/schema";
import { Icon } from "./icons";

const FILTER_KEYS = ["symbol", "direction", "outcome", "setup", "tag", "review"] as const;

export function TradeFilters({
  setups,
  tags = [],
  values = {},
}: {
  setups: string[];
  tags?: TradeTag[];
  /** The filters actually in force — a saved view can supply them. */
  values?: Record<string, string>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [symbol, setSymbol] = useState(values.symbol ?? "");
  const [pending, startTransition] = useTransition();

  const read = (key: string) => values[key] ?? params.get(key) ?? "";

  /**
   * Changing a filter while a saved view is open starts a fresh search from
   * that view's filters, so the view itself is never rewritten by accident.
   */
  const navigate = (changes: Record<string, string>) => {
    const next = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      const value = changes[key] !== undefined ? changes[key] : read(key);
      if (value) next.set(key, value);
    }
    const extra = new URLSearchParams(params.toString());
    for (const key of FILTER_KEYS) extra.delete(key);
    extra.delete("view");
    for (const [key, value] of extra) next.set(key, value);
    startTransition(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };

  const hasFilters = FILTER_KEYS.some((key) => read(key));

  return (
    <div className={`flex flex-wrap items-center gap-2 ${pending ? "opacity-60" : ""}`}>
      <form
        className="relative mr-1"
        onSubmit={(e) => {
          e.preventDefault();
          navigate({ symbol });
        }}
      >
        <input
          aria-label="Search by symbol"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="Search by symbol..."
          className="field h-9 w-[180px] rounded-lg border border-line-2 bg-white pl-9 pr-3 text-xs text-fg outline-none placeholder:text-dim focus:border-brand"
        />
        <button type="submit" aria-label="Search trades" className="absolute inset-y-0 left-0 flex w-9 items-center justify-center text-muted">
          <Icon name="search" size={14} />
        </button>
      </form>
      <Select label="Direction" value={read("direction")} onChange={(v) => navigate({ direction: v })}>
        <option value="">All sides</option>
        <option value="long">Long</option>
        <option value="short">Short</option>
      </Select>
      <Select label="Trade outcome" value={read("outcome")} onChange={(v) => navigate({ outcome: v })}>
        <option value="">All outcomes</option>
        <option value="win">Wins</option>
        <option value="loss">Losses</option>
        <option value="be">Breakeven</option>
      </Select>
      {setups.length > 0 && (
        <Select label="Setup" value={read("setup")} onChange={(v) => navigate({ setup: v })}>
          <option value="">All setups</option>
          {setups.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      )}
      {tags.length > 0 && (
        <Select label="Tag" value={read("tag")} onChange={(v) => navigate({ tag: v })}>
          <option value="">All tags</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.name}>
              {tag.name}
            </option>
          ))}
        </Select>
      )}
      <Select label="Review status" value={read("review")} onChange={(v) => navigate({ review: v })}>
        <option value="">Review status</option>
        <option value="pending">Needs review</option>
        <option value="reviewed">Reviewed</option>
      </Select>
      {hasFilters && (
        <button
          type="button"
          onClick={() => {
            setSymbol("");
            const next = new URLSearchParams(params.toString());
            for (const key of FILTER_KEYS) next.delete(key);
            next.delete("view");
            startTransition(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
          }}
          className="h-9 px-2 text-xs text-brand hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 appearance-none rounded-lg border border-line-2 bg-white pl-3 pr-8 text-xs text-muted outline-none transition-colors hover:border-brand/40 focus:border-brand"
      >
        {children}
      </select>
      <Icon name="down" size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
    </label>
  );
}
