"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createView, deleteView, updateView } from "@/app/view-actions";
import type { TradeViewFilters } from "@/db/schema";
import { TRADE_COLUMNS, type TradeColumnKey } from "@/lib/views";
import { Icon } from "./icons";

export type ViewSummary = { id: number; name: string; pinned: boolean };

export function TradeViewsBar({
  views,
  activeViewId,
  accountId,
  filters,
  columns,
}: {
  views: ViewSummary[];
  activeViewId: number | null;
  accountId: number;
  filters: TradeViewFilters;
  columns: TradeColumnKey[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [saveOpen, setSaveOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [draft, setDraft] = useState<TradeColumnKey[]>(columns);

  const hasFilters = Object.values(filters).some(Boolean);

  const applyColumns = (next: TradeColumnKey[]) => {
    setDraft(next);
    if (activeViewId !== null) {
      const fd = new FormData();
      fd.set("filters", JSON.stringify(filters));
      fd.set("columns", JSON.stringify(next));
      startTransition(async () => {
        await updateView(activeViewId, fd);
      });
      return;
    }
    const search = new URLSearchParams(params.toString());
    search.set("columns", next.join(","));
    startTransition(() => router.replace(`${pathname}?${search.toString()}`, { scroll: false }));
  };

  return (
    <div className="mb-4 space-y-3">
      <div className={`flex flex-wrap items-center gap-2 ${pending ? "opacity-60" : ""}`}>
        <Link
          href="/trades"
          aria-current={activeViewId === null ? "page" : undefined}
          className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-medium transition-colors ${
            activeViewId === null
              ? "border-brand/30 bg-brand/7 text-brand"
              : "border-line-2 bg-white text-muted hover:border-brand/40 hover:text-fg"
          }`}
        >
          All trades
        </Link>

        {views.map((view) => (
          <span key={view.id} className="group inline-flex items-center">
            <Link
              href={`/trades?view=${view.id}`}
              aria-current={activeViewId === view.id ? "page" : undefined}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-medium transition-colors ${
                activeViewId === view.id
                  ? "border-brand/30 bg-brand/7 text-brand"
                  : "border-line-2 bg-white text-muted hover:border-brand/40 hover:text-fg"
              }`}
            >
              {view.pinned && <Icon name="flag" size={11} className="text-brand" />}
              {view.name}
            </Link>
            <button
              type="button"
              aria-label={`Delete the view ${view.name}`}
              onClick={() => startTransition(() => deleteView(view.id))}
              className="ml-0.5 rounded-md p-1 text-dim opacity-0 transition-opacity hover:text-down focus:opacity-100 group-hover:opacity-100"
            >
              <Icon name="plus" size={10} className="rotate-45" />
            </button>
          </span>
        ))}

        <button
          type="button"
          onClick={() => setSaveOpen((open) => !open)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-line-2 bg-white px-3 text-[11px] font-medium text-muted transition-colors hover:border-brand/40 hover:text-brand"
        >
          <Icon name="plus" size={12} />
          Save view
        </button>

        <button
          type="button"
          onClick={() => setColumnsOpen((open) => !open)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-2 bg-white px-3 text-[11px] font-medium text-muted transition-colors hover:border-brand/40 hover:text-fg"
        >
          <Icon name="panel" size={12} />
          Columns
        </button>

        {activeViewId !== null && (
          <span className="text-[10px] text-muted">
            {hasFilters ? "Filters from this view are applied" : "This view has no filters"}
          </span>
        )}
      </div>

      {saveOpen && (
        <form action={createView} className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-panel-2/50 p-3.5">
          <input type="hidden" name="accountId" value={accountId} />
          <input type="hidden" name="filters" value={JSON.stringify(filters)} />
          <input type="hidden" name="columns" value={JSON.stringify(columns)} />
          <div className="min-w-[180px] flex-1">
            <label className="label" htmlFor="view-name">
              View name
            </label>
            <input
              id="view-name"
              name="name"
              required
              maxLength={60}
              placeholder="e.g. News mistakes this month"
              className="field h-9 text-xs"
            />
          </div>
          <label className="flex h-9 items-center gap-2 text-[11px] text-muted">
            <input type="checkbox" name="pinned" className="h-3.5 w-3.5 accent-[#0781fe]" />
            Pin to the top
          </label>
          <button type="submit" className="btn-primary h-9">
            <Icon name="check" size={14} />
            Save view
          </button>
        </form>
      )}

      {columnsOpen && (
        <div className="rounded-lg border border-line bg-panel-2/50 p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            {TRADE_COLUMNS.map((column) => {
              const on = draft.includes(column.key);
              return (
                <button
                  key={column.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    applyColumns(
                      on ? draft.filter((key) => key !== column.key) : [...draft, column.key],
                    )
                  }
                  className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-medium transition-colors ${
                    on
                      ? "border-brand/30 bg-brand/7 text-brand"
                      : "border-line-2 bg-white text-muted hover:border-brand/40 hover:text-fg"
                  }`}
                >
                  <Icon name="check" size={11} className={on ? "" : "opacity-0"} />
                  {column.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2.5 text-[10px] text-muted">
            {activeViewId !== null
              ? "Changes are saved to the active view."
              : "Changes apply to this page. Save a view to keep them."}
          </p>
        </div>
      )}
    </div>
  );
}
