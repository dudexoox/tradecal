import type { TradeViewFilters } from "@/db/schema";

/** The columns the trade log can show. */
export const TRADE_COLUMNS = [
  { key: "date", label: "Close date", locked: true },
  { key: "symbol", label: "Symbol" },
  { key: "pnl", label: "Net P&L / R" },
  { key: "side", label: "Side" },
  { key: "setup", label: "Setup" },
  { key: "rating", label: "Execution" },
  { key: "duration", label: "Duration" },
  { key: "size", label: "Size" },
  { key: "tags", label: "Tags" },
  { key: "journal", label: "Journal" },
] as const;

export type TradeColumnKey = (typeof TRADE_COLUMNS)[number]["key"];

/** The columns shown when a trader has not chosen their own set. */
export const DEFAULT_COLUMNS: TradeColumnKey[] = [
  "date",
  "symbol",
  "pnl",
  "side",
  "setup",
  "rating",
  "journal",
];

export function isTradeColumnKey(value: string): value is TradeColumnKey {
  return TRADE_COLUMNS.some((column) => column.key === value);
}

/**
 * Normalises a stored column list: unknown keys are dropped, the date column
 * is always present, and the result follows the canonical order.
 */
export function normaliseColumns(columns: string[] | undefined | null): TradeColumnKey[] {
  const wanted = new Set((columns ?? []).filter(isTradeColumnKey));
  wanted.add("date");
  return TRADE_COLUMNS.map((column) => column.key).filter((key) => wanted.has(key));
}

/** The filters a view can carry. */
export const TRADE_FILTER_KEYS: (keyof TradeViewFilters)[] = [
  "symbol",
  "direction",
  "outcome",
  "setup",
  "tag",
  "review",
  "source",
];

export function normaliseFilters(filters: TradeViewFilters | undefined | null): TradeViewFilters {
  const out: TradeViewFilters = {};
  if (!filters) return out;
  if (filters.symbol?.trim()) out.symbol = filters.symbol.trim();
  if (filters.direction === "long" || filters.direction === "short") out.direction = filters.direction;
  if (filters.outcome === "win" || filters.outcome === "loss" || filters.outcome === "be") out.outcome = filters.outcome;
  if (filters.setup?.trim()) out.setup = filters.setup.trim();
  if (filters.tag?.trim()) out.tag = filters.tag.trim();
  if (filters.review === "pending" || filters.review === "reviewed") out.review = filters.review;
  if (filters.source === "mt5" || filters.source === "manual") out.source = filters.source;
  return out;
}

/** Turns filters into the query string used by the trade log page. */
export function filtersToQuery(filters: TradeViewFilters): string {
  const params = new URLSearchParams();
  for (const key of TRADE_FILTER_KEYS) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  return params.toString();
}

/** True when a filter set would match nothing more than an empty set. */
export function hasFilters(filters: TradeViewFilters): boolean {
  return TRADE_FILTER_KEYS.some((key) => Boolean(filters[key]));
}
