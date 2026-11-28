import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
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
    /** Planned stop loss and take profit, used for planned R:R and R-multiple. */
    stopLoss: numeric("stop_loss", { precision: 18, scale: 5, mode: "number" }),
    takeProfit: numeric("take_profit", { precision: 18, scale: 5, mode: "number" }),
    /** Planned risk in the account currency — 1R. */
    riskAmount: numeric("risk_amount", { precision: 14, scale: 2, mode: "number" }),
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

/* ---------------------------- chart preferences ---------------------------- */

/** Interval values accepted by the TradingView Advanced Chart widget. */
export const TV_INTERVALS = ["1", "3", "5", "15", "30", "60", "120", "180", "240", "D", "W"] as const;
export type TvInterval = (typeof TV_INTERVALS)[number];
export const TV_THEMES = ["light", "dark"] as const;
export type TvTheme = (typeof TV_THEMES)[number];
export const TV_CHART_TYPES = ["candles", "bars", "hollow-candles", "heikin-ashi", "line", "area"] as const;
export type TvChartType = (typeof TV_CHART_TYPES)[number];
export const TV_TIMEZONES = ["Etc/UTC", "exchange"] as const;
export type TvTimezone = (typeof TV_TIMEZONES)[number];

/**
 * One chart setup per signed-in user, shared by every trade. TradingView's
 * hosted widget owns drawings and indicator internals; these are the wrapper
 * settings we can read back and restore.
 */
export const chartPreferences = pgTable("chart_preferences", {
  userId: uuid("user_id").primaryKey(),
  interval: text("interval").$type<TvInterval>().notNull().default("15"),
  theme: text("theme").$type<TvTheme>().notNull().default("light"),
  chartType: text("chart_type").$type<TvChartType>().notNull().default("candles"),
  timezone: text("timezone").$type<TvTimezone>().notNull().default("Etc/UTC"),
  showDrawingToolbar: boolean("show_drawing_toolbar").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ChartPreferences = typeof chartPreferences.$inferSelect;

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

/* ----------------------------------- tags ---------------------------------- */

export const tags = pgTable(
  "tags",
  {
    id: serial("id").primaryKey(),
    /** Owning Supabase Auth user. */
    userId: uuid("user_id").notNull(),
    name: text("name").notNull(),
    /** Chip colour, assigned from a small palette when the tag is created. */
    color: text("color").notNull().default("#0781fe"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tags_user_idx").on(t.userId), uniqueIndex("tags_user_name_uq").on(t.userId, t.name)],
);

export const tradeTags = pgTable(
  "trade_tags",
  {
    tradeId: integer("trade_id")
      .notNull()
      .references(() => trades.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    /** Owning Supabase Auth user — mirrors trades.user_id for direct scoping. */
    userId: uuid("user_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tradeId, t.tagId] }),
    index("trade_tags_user_idx").on(t.userId),
    index("trade_tags_tag_idx").on(t.tagId),
  ],
);

/* ------------------------------ daily routine ------------------------------ */

export const RULE_STAGES = ["prepare", "trade", "reflect"] as const;
export type RuleStage = (typeof RULE_STAGES)[number];

/** One checkable rule in the daily Routine tracker. */
export const tradingRules = pgTable(
  "trading_rules",
  {
    id: serial("id").primaryKey(),
    /** Owning Supabase Auth user. */
    userId: uuid("user_id").notNull(),
    stage: text("stage").$type<RuleStage>().notNull().default("prepare"),
    title: text("title").notNull(),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("trading_rules_user_idx").on(t.userId),
    uniqueIndex("trading_rules_user_title_uq").on(t.userId, t.title),
  ],
);

/** The pre-market plan and end-of-day review for one trading date. */
export const dailyPlans = pgTable(
  "daily_plans",
  {
    id: serial("id").primaryKey(),
    /** Owning Supabase Auth user. */
    userId: uuid("user_id").notNull(),
    planDate: date("plan_date").notNull(),
    /* Before the session */
    intention: text("intention"),
    marketBias: text("market_bias"),
    watchlist: text("watchlist"),
    maxTrades: integer("max_trades"),
    maxRiskPct: numeric("max_risk_pct", { precision: 5, scale: 2, mode: "number" }),
    /* After the session */
    review: text("review"),
    rating: integer("rating"),
    followedPlan: boolean("followed_plan"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("daily_plans_user_idx").on(t.userId),
    uniqueIndex("daily_plans_user_date_uq").on(t.userId, t.planDate),
  ],
);

/** A rule ticked on a given day. The unique key makes ticking idempotent. */
export const dailyRuleChecks = pgTable(
  "daily_rule_checks",
  {
    id: serial("id").primaryKey(),
    /** Owning Supabase Auth user. */
    userId: uuid("user_id").notNull(),
    planDate: date("plan_date").notNull(),
    ruleId: integer("rule_id")
      .notNull()
      .references(() => tradingRules.id, { onDelete: "cascade" }),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("daily_rule_checks_user_idx").on(t.userId),
    index("daily_rule_checks_rule_idx").on(t.ruleId),
    uniqueIndex("daily_rule_checks_user_date_rule_uq").on(t.userId, t.planDate, t.ruleId),
  ],
);

/* --------------------------- goals & risk limits --------------------------- */

/**
 * Per-account trading goals and guardrails. Amounts are in the account
 * currency; when an amount is left empty the account's percentage objective
 * is used instead, so an account always has sensible limits.
 */
export const tradingGoals = pgTable(
  "trading_goals",
  {
    id: serial("id").primaryKey(),
    /** Owning Supabase Auth user. */
    userId: uuid("user_id").notNull(),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** Net profit target for the account, in account currency. */
    profitTarget: numeric("profit_target", { precision: 14, scale: 2, mode: "number" }),
    /** Maximum loss allowed in a single day. */
    dailyLossLimit: numeric("daily_loss_limit", { precision: 14, scale: 2, mode: "number" }),
    /** Maximum total loss allowed on the account. */
    maxLossLimit: numeric("max_loss_limit", { precision: 14, scale: 2, mode: "number" }),
    /** Maximum planned risk for a single trade, in account currency. */
    maxRiskPerTrade: numeric("max_risk_per_trade", { precision: 14, scale: 2, mode: "number" }),
    /** Maximum planned risk for a single trade, as a percentage of the balance. */
    maxRiskPerTradePct: numeric("max_risk_per_trade_pct", { precision: 5, scale: 2, mode: "number" }),
    /** Maximum number of trades allowed in one day. */
    maxTradesPerDay: integer("max_trades_per_day"),
    /** Maximum number of trades allowed open at the same time. */
    maxOpenTrades: integer("max_open_trades"),
    /** Percentage of a limit at which a warning appears. */
    warnAtPct: numeric("warn_at_pct", { precision: 5, scale: 2, mode: "number" }).notNull().default(80),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("trading_goals_user_idx").on(t.userId),
    uniqueIndex("trading_goals_user_account_uq").on(t.userId, t.accountId),
  ],
);

export type TradingGoal = typeof tradingGoals.$inferSelect;

/* ----------------------------- session replay ------------------------------ */

export const SESSION_MARKER_KINDS = ["note", "plan", "mistake", "win"] as const;
export type SessionMarkerKind = (typeof SESSION_MARKER_KINDS)[number];

/** A note pinned to a moment inside a trading session. */
export const sessionMarkers = pgTable(
  "session_markers",
  {
    id: serial("id").primaryKey(),
    /** Owning Supabase Auth user. */
    userId: uuid("user_id").notNull(),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** The trading day this marker belongs to. */
    markerDate: date("marker_date").notNull(),
    /** Exact moment the marker refers to. */
    at: timestamp("at", { withTimezone: true }).notNull(),
    kind: text("kind").$type<SessionMarkerKind>().notNull().default("note"),
    note: text("note").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("session_markers_user_idx").on(t.userId),
    index("session_markers_date_idx").on(t.markerDate),
  ],
);

export type SessionMarker = typeof sessionMarkers.$inferSelect;

/* -------------------------- performance digest ----------------------------- */

export const DIGEST_PERIODS = ["week", "month"] as const;
export type DigestPeriod = (typeof DIGEST_PERIODS)[number];

/** The numbers behind an auto-written digest. */
export type DigestMetrics = {
  pnl: number;
  trades: number;
  wins: number;
  winRate: number;
  totalR: number | null;
  avgR: number | null;
  tradingDays: number;
  bestDay: { key: string; pnl: number } | null;
  worstDay: { key: string; pnl: number } | null;
  bestSetup: string | null;
  rulesDone: number;
  rulesTotal: number;
  rulePct: number;
};

/** One auto-written weekly or monthly summary, with an optional personal note. */
export const performanceDigests = pgTable(
  "performance_digests",
  {
    id: serial("id").primaryKey(),
    /** Owning Supabase Auth user. */
    userId: uuid("user_id").notNull(),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    period: text("period").$type<DigestPeriod>().notNull(),
    /** First day of the week or month the digest covers. */
    periodStart: date("period_start").notNull(),
    /** The generated summary text. */
    summary: text("summary").notNull(),
    metrics: jsonb("metrics").$type<DigestMetrics>().notNull().default(sql`'{}'::jsonb`),
    /** A note the trader adds to the generated summary. */
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("performance_digests_user_idx").on(t.userId),
    uniqueIndex("performance_digests_user_account_period_uq").on(
      t.userId,
      t.accountId,
      t.period,
      t.periodStart,
    ),
  ],
);

export type PerformanceDigest = typeof performanceDigests.$inferSelect;

/* ------------------------- saved views & columns --------------------------- */

/** The filters a saved trade-log view can capture. */
export type TradeViewFilters = {
  symbol?: string;
  direction?: "long" | "short";
  outcome?: "win" | "loss" | "be";
  setup?: string;
  tag?: string;
  review?: "pending" | "reviewed";
  source?: "mt5" | "manual";
};

/** A saved filter + column set for the trade log. */
export const tradeViews = pgTable(
  "trade_views",
  {
    id: serial("id").primaryKey(),
    /** Owning Supabase Auth user. */
    userId: uuid("user_id").notNull(),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    filters: jsonb("filters").$type<TradeViewFilters>().notNull().default(sql`'{}'::jsonb`),
    /** Ordered list of visible column keys. Empty means "the default set". */
    columns: jsonb("columns").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("trade_views_user_idx").on(t.userId),
    uniqueIndex("trade_views_user_account_name_uq").on(t.userId, t.accountId, t.name),
  ],
);

export type TradeView = typeof tradeViews.$inferSelect;

/* ---------------------------- setup templates ------------------------------ */

/** A reusable setup: log the same trade again with one click. */
export const tradeTemplates = pgTable(
  "trade_templates",
  {
    id: serial("id").primaryKey(),
    /** Owning Supabase Auth user. */
    userId: uuid("user_id").notNull(),
    name: text("name").notNull(),
    symbol: text("symbol").notNull(),
    direction: text("direction").$type<TradeDirection>().notNull().default("long"),
    entryPrice: numeric("entry_price", { precision: 18, scale: 5, mode: "number" }),
    stopLoss: numeric("stop_loss", { precision: 18, scale: 5, mode: "number" }),
    takeProfit: numeric("take_profit", { precision: 18, scale: 5, mode: "number" }),
    riskAmount: numeric("risk_amount", { precision: 14, scale: 2, mode: "number" }),
    size: numeric("size", { precision: 12, scale: 2, mode: "number" }),
    setup: text("setup"),
    notes: text("notes"),
    strategyId: integer("strategy_id").references(() => strategies.id, { onDelete: "set null" }),
    /** Tag names applied to every trade logged from this template. */
    tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("trade_templates_user_idx").on(t.userId),
    uniqueIndex("trade_templates_user_name_uq").on(t.userId, t.name),
  ],
);

export type TradeTemplate = typeof tradeTemplates.$inferSelect;

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

export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
/** The tag fields safe to send to client components. */
export type TradeTag = Pick<Tag, "id" | "name" | "color">;
export type TradeWithTags = Trade & { tags: TradeTag[] };

export type TradingRule = typeof tradingRules.$inferSelect;
export type NewTradingRule = typeof tradingRules.$inferInsert;
export type DailyPlan = typeof dailyPlans.$inferSelect;
export type NewDailyPlan = typeof dailyPlans.$inferInsert;
export type DailyRuleCheck = typeof dailyRuleChecks.$inferSelect;
