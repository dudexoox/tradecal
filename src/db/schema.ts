import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const ACCOUNT_PHASES = ["challenge", "verification", "funded", "personal"] as const;
export type AccountPhase = (typeof ACCOUNT_PHASES)[number];

export const TRADE_DIRECTIONS = ["long", "short"] as const;
export type TradeDirection = (typeof TRADE_DIRECTIONS)[number];

export const MOODS = ["calm", "focused", "confident", "anxious", "frustrated", "tired"] as const;
export type Mood = (typeof MOODS)[number];

export const accounts = pgTable(
  "accounts",
  {
    id: serial("id").primaryKey(),
    /** Owning Supabase Auth user. NULL only until the first account claims migrated data. */
    userId: uuid("user_id"),
    name: text("name").notNull(),
    phase: text("phase").$type<AccountPhase>().notNull().default("challenge"),
    currency: text("currency").notNull().default("USD"),
    startingBalance: numeric("starting_balance", { precision: 14, scale: 2, mode: "number" }).notNull(),
    profitTargetPct: numeric("profit_target_pct", { precision: 5, scale: 2, mode: "number" }).notNull().default(10),
    maxDailyLossPct: numeric("max_daily_loss_pct", { precision: 5, scale: 2, mode: "number" }).notNull().default(5),
    maxLossPct: numeric("max_loss_pct", { precision: 5, scale: 2, mode: "number" }).notNull().default(10),
    /* MetaTrader 5 automatic tracking (investor / read-only access) */
    mt5Enabled: boolean("mt5_enabled").notNull().default(false),
    mt5Login: text("mt5_login"),
    mt5Server: text("mt5_server"),
    /** Read-only investor password. Never sent to the browser. */
    mt5InvestorPassword: text("mt5_investor_password"),
    /** Cached id of the connected API server (MetaApi) so we don't provision it twice. */
    mt5ApiAccountId: text("mt5_api_account_id"),
    mt5Mode: text("mt5_mode").$type<"live" | "demo">(),
    mt5Status: text("mt5_status").$type<"idle" | "connected" | "error">().notNull().default("idle"),
    mt5LastError: text("mt5_last_error"),
    mt5LastSyncAt: timestamp("mt5_last_sync_at", { withTimezone: true }),
    mt5LastImported: integer("mt5_last_imported").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);

export const trades = pgTable(
  "trades",
  {
    id: serial("id").primaryKey(),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** Owning Supabase Auth user — mirrors accounts.user_id for direct scoping. */
    userId: uuid("user_id"),
    symbol: text("symbol").notNull(),
    direction: text("direction").$type<TradeDirection>().notNull(),
    entryPrice: numeric("entry_price", { precision: 18, scale: 5, mode: "number" }),
    exitPrice: numeric("exit_price", { precision: 18, scale: 5, mode: "number" }),
    size: numeric("size", { precision: 12, scale: 2, mode: "number" }),
    pnl: numeric("pnl", { precision: 14, scale: 2, mode: "number" }).notNull(),
    fees: numeric("fees", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    setup: text("setup"),
    rating: integer("rating"),
    notes: text("notes"),
    /** Uploaded chart screenshot (served from /api/uploads/...). */
    chartImageUrl: text("chart_image_url"),
    /** Uploaded picture of the setup / thesis. */
    setupImageUrl: text("setup_image_url"),
    /** Optional TradingView chart link instead of (or alongside) a screenshot. */
    tradingviewUrl: text("tradingview_url"),
    /** "manual" when typed in, "mt5" when imported from MetaTrader 5. */
    source: text("source").notNull().default("manual"),
    /** Stable broker identifier (position id) so re-syncing never duplicates a trade. */
    externalId: text("external_id"),
    /** The playbook strategy this trade was taken with. */
    strategyId: integer("strategy_id").references(() => strategies.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("trades_account_idx").on(t.accountId),
    index("trades_user_idx").on(t.userId),
    index("trades_opened_at_idx").on(t.openedAt),
    index("trades_strategy_idx").on(t.strategyId),
    uniqueIndex("trades_account_external_uq").on(t.accountId, t.externalId),
  ],
);

/* ------------------------------ chart candles ------------------------------ */

export const CHART_TIMEFRAMES = ["M5", "M15", "H1", "H4", "D1"] as const;
export type ChartTimeframe = (typeof CHART_TIMEFRAMES)[number];

/**
 * OHLC bars around one trade, pulled from the broker by the desktop sync so
 * every trade page can render a chart pinned to the moment of entry.
 * `time` is the candle open time in unix seconds, stored in the same instant
 * space as trades.openedAt so markers line up in any timezone.
 */
export const chartCandles = pgTable(
  "chart_candles",
  {
    id: serial("id").primaryKey(),
    tradeId: integer("trade_id")
      .notNull()
      .references(() => trades.id, { onDelete: "cascade" }),
    /** Owning Supabase Auth user — mirrors trades.user_id for direct scoping. */
    userId: uuid("user_id"),
    symbol: text("symbol").notNull(),
    timeframe: text("timeframe").$type<ChartTimeframe>().notNull(),
    /** Candle open time (unix seconds). */
    time: integer("time").notNull(),
    open: numeric("open", { precision: 18, scale: 5, mode: "number" }).notNull(),
    high: numeric("high", { precision: 18, scale: 5, mode: "number" }).notNull(),
    low: numeric("low", { precision: 18, scale: 5, mode: "number" }).notNull(),
    close: numeric("close", { precision: 18, scale: 5, mode: "number" }).notNull(),
  },
  (t) => [
    index("chart_candles_trade_idx").on(t.tradeId),
    index("chart_candles_user_idx").on(t.userId),
    uniqueIndex("chart_candles_trade_tf_time_uq").on(t.tradeId, t.timeframe, t.time),
  ],
);

/* --------------------------------- playbook --------------------------------- */

export const playbooks = pgTable(
  "playbooks",
  {
    id: serial("id").primaryKey(),
    /** Owning Supabase Auth user. NULL only until the first account claims migrated data. */
    userId: uuid("user_id"),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("playbooks_user_idx").on(t.userId)],
);

export const STRATEGY_STATUSES = ["active", "testing", "archived"] as const;
export type StrategyStatus = (typeof STRATEGY_STATUSES)[number];

export const STRATEGY_MARKETS = ["FX", "Indices", "Commodities", "Crypto", "Stocks"] as const;
export type StrategyMarket = (typeof STRATEGY_MARKETS)[number];

export const STRATEGY_DIRECTIONS = ["both", "long", "short"] as const;
export type StrategyDirection = (typeof STRATEGY_DIRECTIONS)[number];

/**
 * One reusable strategy inside the playbook. Criteria lists are stored as
 * newline-delimited text: one checkable item per line.
 */
export const strategies = pgTable(
  "strategies",
  {
    id: serial("id").primaryKey(),
    /** Owning Supabase Auth user. NULL only until the first account claims migrated data. */
    userId: uuid("user_id"),
    playbookId: integer("playbook_id").references(() => playbooks.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    market: text("market").$type<StrategyMarket>().notNull().default("FX"),
    timeframe: text("timeframe"),
    session: text("session"),
    direction: text("direction").$type<StrategyDirection>().notNull().default("both"),
    status: text("status").$type<StrategyStatus>().notNull().default("testing"),
    rating: integer("rating"),
    risk: text("risk"),
    /** Describe the strategy in your own words. */
    description: text("description"),
    /** Explain how it has worked in practice. */
    howItWorks: text("how_it_works"),
    /** Where exactly the trade is taken. */
    entryWhere: text("entry_where"),
    /** Why that location is worth entering. */
    entryWhy: text("entry_why"),
    /** Checklist: conditions that must be true before entering. */
    entryCriteria: text("entry_criteria").notNull().default(""),
    /** Checklist: reasons to skip the trade. */
    avoidCriteria: text("avoid_criteria").notNull().default(""),
    /** Which criteria the strategy deliberately ignores, and why. */
    skipReasons: text("skip_reasons"),
    /** What proves the idea wrong (stop / invalidation). */
    invalidation: text("invalidation"),
    /** Take-profit plan. */
    target: text("target"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("strategies_user_idx").on(t.userId)],
);

export type Playbook = typeof playbooks.$inferSelect;
export type NewPlaybook = typeof playbooks.$inferInsert;
export type Strategy = typeof strategies.$inferSelect;
export type NewStrategy = typeof strategies.$inferInsert;

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: serial("id").primaryKey(),
    /** Owning Supabase Auth user. NULL only until the first account claims migrated data. */
    userId: uuid("user_id"),
    entryDate: date("entry_date").notNull(),
    mood: text("mood").$type<Mood>(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("journal_entries_user_idx").on(t.userId),
    // One entry per day per user (was globally unique before multi-user).
    uniqueIndex("journal_entries_user_date_uq").on(t.userId, t.entryDate),
  ],
);

export const accountsRelations = relations(accounts, ({ many }) => ({
  trades: many(trades),
}));

export const tradesRelations = relations(trades, ({ one }) => ({
  account: one(accounts, { fields: [trades.accountId], references: [accounts.id] }),
}));

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
/** The account shape that is safe to hand to client components — no credentials. */
export type PublicAccount = Omit<Account, "mt5InvestorPassword"> & { hasMt5Password: boolean };
export type Trade = typeof trades.$inferSelect;
export type NewTrade = typeof trades.$inferInsert;
export type ChartCandle = typeof chartCandles.$inferSelect;
export type JournalEntry = typeof journalEntries.$inferSelect;
export type NewJournalEntry = typeof journalEntries.$inferInsert;
