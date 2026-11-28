import { db } from "@/db";
import {
  accounts,
  dailyPlans,
  dailyRuleChecks,
  journalEntries,
  performanceDigests,
  sessionMarkers,
  strategies,
  tags,
  tradeTags,
  tradeTemplates,
  tradeViews,
  trades,
  tradingGoals,
  tradingRules,
  type Account,
  type DailyPlan,
  type DigestPeriod,
  type PerformanceDigest,
  type PublicAccount,
  type SessionMarker,
  type Tag,
  type Trade,
  type TradeTag,
  type TradeTemplate,
  type TradeView,
  type TradeWithTags,
  type TradingGoal,
  type TradingRule,
} from "@/db/schema";
import { and, asc, desc, eq, gt, gte, ilike, inArray, lt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { requireUser } from "./auth";
import { ensureSeeded } from "./seed";
import { syncAccount } from "./mt5";
import { ensureDefaultRules } from "./routine";

export const ACCOUNT_COOKIE = "journal_account";
const AUTO_SYNC_MS = 5 * 60_000;
const ERROR_RETRY_MS = 30 * 60_000;

/** Strips the investor password before any account reaches the browser. */
function toPublicAccount(account: Account): PublicAccount {
  const { mt5InvestorPassword, ...rest } = account;
  return { ...rest, hasMt5Password: Boolean(mt5InvestorPassword) };
}

export async function getAccounts(): Promise<PublicAccount[]> {
  const userId = await requireUser();
  await ensureSeeded(userId);
  const rows = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .orderBy(asc(accounts.createdAt), asc(accounts.id));
  return rows.map(toPublicAccount);
}

export async function getActiveAccount(): Promise<{ account: PublicAccount | null; accounts: PublicAccount[] }> {
  const all = await getAccounts();
  if (all.length === 0) return { account: null, accounts: all };
  const store = await cookies();
  const raw = store.get(ACCOUNT_COOKIE)?.value;
  const id = raw ? Number(raw) : NaN;
  const account = all.find((a) => a.id === id) ?? all[0];
  return { account, accounts: all };
}

/** Full row including credentials — server code only, never a component prop. Ownership-checked. */
export async function getAccountSecrets(id: number): Promise<Account | null> {
  const userId = await requireUser();
  const [row] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
    .limit(1);
  return row ?? null;
}

/**
 * Refreshes MT5 history when the workspace is opened, so auto-tracked
 * accounts stay current without anyone pressing a button.
 */
export async function maybeAutoSync(account: PublicAccount): Promise<void> {
  // On serverless hosts the desktop sync agent keeps MT5 data fresh in Supabase.
  if (process.env.VERCEL) return;
  if (!account.mt5Enabled || !account.mt5Login || !account.mt5Server) return;
  const last = account.mt5LastSyncAt?.getTime() ?? 0;
  const now = Date.now();
  if (now - last < AUTO_SYNC_MS) return;
  if (account.mt5Status === "error" && now - last < ERROR_RETRY_MS) return;
  const full = await getAccountSecrets(account.id);
  if (full) await syncAccount(full);
}

/** Tags attached to a set of trades, scoped to the owning user. */
async function tagsByTradeIds(userId: string, ids: number[]): Promise<Map<number, TradeTag[]>> {
  const map = new Map<number, TradeTag[]>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({ tradeId: tradeTags.tradeId, id: tags.id, name: tags.name, color: tags.color })
    .from(tradeTags)
    .innerJoin(tags, eq(tags.id, tradeTags.tagId))
    .where(and(eq(tradeTags.userId, userId), eq(tags.userId, userId), inArray(tradeTags.tradeId, ids)))
    .orderBy(asc(tags.name));
  for (const row of rows) {
    const list = map.get(row.tradeId) ?? [];
    list.push({ id: row.id, name: row.name, color: row.color });
    map.set(row.tradeId, list);
  }
  return map;
}

function attachTags(rows: Trade[], map: Map<number, TradeTag[]>): TradeWithTags[] {
  return rows.map((trade) => ({ ...trade, tags: map.get(trade.id) ?? [] }));
}

export type TradeFilters = {
  symbol?: string;
  direction?: "long" | "short";
  outcome?: "win" | "loss" | "be";
  setup?: string;
  tag?: string;
  review?: "pending" | "reviewed";
  source?: "mt5" | "manual";
};

export async function getTrades(accountId: number, filters: TradeFilters = {}): Promise<TradeWithTags[]> {
  const userId = await requireUser();
  const conds = [eq(trades.accountId, accountId), eq(trades.userId, userId)];
  if (filters.symbol) conds.push(ilike(trades.symbol, `%${filters.symbol}%`));
  if (filters.direction) conds.push(eq(trades.direction, filters.direction));
  if (filters.setup) conds.push(eq(trades.setup, filters.setup));
  if (filters.outcome === "win") conds.push(gt(trades.pnl, 0));
  if (filters.outcome === "loss") conds.push(lt(trades.pnl, 0));
  if (filters.outcome === "be") conds.push(eq(trades.pnl, 0));
  if (filters.review === "pending") conds.push(sql`coalesce(trim(${trades.notes}), '') = ''`);
  if (filters.review === "reviewed") conds.push(sql`coalesce(trim(${trades.notes}), '') <> ''`);
  if (filters.source) conds.push(eq(trades.source, filters.source));

  const rows = await db
    .select()
    .from(trades)
    .where(and(...conds))
    .orderBy(desc(sql`coalesce(${trades.closedAt}, ${trades.openedAt})`), desc(trades.id));

  const tagged = attachTags(rows, await tagsByTradeIds(userId, rows.map((row) => row.id)));
  if (!filters.tag) return tagged;
  const wanted = filters.tag.trim().toLowerCase();
  return tagged.filter((trade) => trade.tags.some((tag) => tag.name.toLowerCase() === wanted));
}

/** Credential-free lookup, safe for server pages and client props. Ownership-checked. */
export async function getAccountById(id: number): Promise<PublicAccount | null> {
  const userId = await requireUser();
  const [row] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
    .limit(1);
  return row ? toPublicAccount(row) : null;
}

/** Ownership-checked: other users' trades are indistinguishable from missing ones. */
export async function getTradeById(id: number): Promise<TradeWithTags | null> {
  const userId = await requireUser();
  const [row] = await db
    .select()
    .from(trades)
    .where(and(eq(trades.id, id), eq(trades.userId, userId)))
    .limit(1);
  if (!row) return null;
  return attachTags([row], await tagsByTradeIds(userId, [row.id]))[0];
}

/** Every tag owned by the signed-in user, including ones not attached to a trade yet. */
export async function getTags(): Promise<Tag[]> {
  const userId = await requireUser();
  return db.select().from(tags).where(eq(tags.userId, userId)).orderBy(asc(tags.name));
}

/** Strategy names for the playbook report — ownership-checked. */
export async function getStrategiesForReports(): Promise<{ id: number; name: string; playbookId: number | null }[]> {
  const userId = await requireUser();
  return db
    .select({ id: strategies.id, name: strategies.name, playbookId: strategies.playbookId })
    .from(strategies)
    .where(eq(strategies.userId, userId))
    .orderBy(asc(strategies.name));
}

export async function getDistinctSetups(accountId: number): Promise<string[]> {
  const userId = await requireUser();
  const rows = await db
    .selectDistinct({ setup: trades.setup })
    .from(trades)
    .where(and(eq(trades.accountId, accountId), eq(trades.userId, userId)))
    .orderBy(asc(trades.setup));
  return rows.map((r) => r.setup).filter((s): s is string => Boolean(s && s.trim()));
}

export async function getDistinctSymbols(accountId: number): Promise<string[]> {
  const userId = await requireUser();
  const rows = await db
    .selectDistinct({ symbol: trades.symbol })
    .from(trades)
    .where(and(eq(trades.accountId, accountId), eq(trades.userId, userId)))
    .orderBy(asc(trades.symbol));
  return rows.map((r) => r.symbol);
}

export async function getJournalEntries() {
  const userId = await requireUser();
  await ensureSeeded(userId);
  return db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.userId, userId))
    .orderBy(desc(journalEntries.entryDate));
}

export async function getJournalEntryByDate(entryDate: string) {
  const userId = await requireUser();
  const [row] = await db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.entryDate, entryDate), eq(journalEntries.userId, userId)))
    .limit(1);
  return row ?? null;
}

export type AccountSummary = {
  account: PublicAccount;
  tradeCount: number;
  netPnl: number;
  syncedCount: number;
};

export async function getAccountSummaries(): Promise<AccountSummary[]> {
  const userId = await requireUser();
  const all = await getAccounts();
  const agg = await db
    .select({
      accountId: trades.accountId,
      tradeCount: sql<number>`count(*)::int`,
      netPnl: sql<number>`coalesce(sum(${trades.pnl}), 0)::float8`,
      synced: sql<number>`count(*) filter (where ${trades.source} = 'mt5')::int`,
    })
    .from(trades)
    .where(eq(trades.userId, userId))
    .groupBy(trades.accountId);
  const map = new Map(agg.map((a) => [a.accountId, a]));
  return all.map((account) => ({
    account,
    tradeCount: map.get(account.id)?.tradeCount ?? 0,
    netPnl: Number(map.get(account.id)?.netPnl ?? 0),
    syncedCount: map.get(account.id)?.synced ?? 0,
  }));
}

/* ------------------------------- daily routine ------------------------------ */

export type RoutineDay = { rules: TradingRule[]; checkedIds: number[]; plan: DailyPlan | null };
export type RoutineHistoryDay = { checked: number; hasPlan: boolean; hasReview: boolean };

/** Everything the Routine page needs for one date. Ownership-checked. */
export async function getRoutineDay(planDate: string): Promise<RoutineDay> {
  const userId = await requireUser();
  await ensureDefaultRules(userId);
  const [rules, checks, plans] = await Promise.all([
    db
      .select()
      .from(tradingRules)
      .where(eq(tradingRules.userId, userId))
      .orderBy(asc(tradingRules.sortOrder), asc(tradingRules.id)),
    db
      .select({ ruleId: dailyRuleChecks.ruleId })
      .from(dailyRuleChecks)
      .where(and(eq(dailyRuleChecks.userId, userId), eq(dailyRuleChecks.planDate, planDate))),
    db
      .select()
      .from(dailyPlans)
      .where(and(eq(dailyPlans.userId, userId), eq(dailyPlans.planDate, planDate)))
      .limit(1),
  ]);
  return { rules, checkedIds: checks.map((check) => check.ruleId), plan: plans[0] ?? null };
}

/** Rule completion and plan/review presence for a date range, keyed by YYYY-MM-DD. */
export async function getRoutineHistory(fromDate: string): Promise<Map<string, RoutineHistoryDay>> {
  const userId = await requireUser();
  const [checks, plans] = await Promise.all([
    db
      .select({ planDate: dailyRuleChecks.planDate, checked: sql<number>`count(*)::int` })
      .from(dailyRuleChecks)
      .where(and(eq(dailyRuleChecks.userId, userId), gte(dailyRuleChecks.planDate, fromDate)))
      .groupBy(dailyRuleChecks.planDate),
    db
      .select({
        planDate: dailyPlans.planDate,
        intention: dailyPlans.intention,
        marketBias: dailyPlans.marketBias,
        watchlist: dailyPlans.watchlist,
        review: dailyPlans.review,
        rating: dailyPlans.rating,
      })
      .from(dailyPlans)
      .where(and(eq(dailyPlans.userId, userId), gte(dailyPlans.planDate, fromDate))),
  ]);

  const map = new Map<string, RoutineHistoryDay>();
  for (const check of checks) {
    map.set(check.planDate, { checked: Number(check.checked), hasPlan: false, hasReview: false });
  }
  for (const plan of plans) {
    const current = map.get(plan.planDate) ?? { checked: 0, hasPlan: false, hasReview: false };
    current.hasPlan = Boolean(
      (plan.intention ?? "").trim() || (plan.marketBias ?? "").trim() || (plan.watchlist ?? "").trim(),
    );
    current.hasReview = Boolean((plan.review ?? "").trim() || plan.rating !== null);
    map.set(plan.planDate, current);
  }
  return map;
}

/** The number of active routine rules — the denominator for rule completion. */
export async function getActiveRuleCount(): Promise<number> {
  const userId = await requireUser();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tradingRules)
    .where(and(eq(tradingRules.userId, userId), eq(tradingRules.active, true)));
  return row?.count ?? 0;
}

/* --------------------------- goals & risk limits --------------------------- */

/** The goals row for one account. Ownership-checked. */
export async function getGoals(accountId: number): Promise<TradingGoal | null> {
  const userId = await requireUser();
  const [row] = await db
    .select()
    .from(tradingGoals)
    .where(and(eq(tradingGoals.userId, userId), eq(tradingGoals.accountId, accountId)))
    .limit(1);
  return row ?? null;
}

/* ----------------------------- session replay ------------------------------ */

/** The notes pinned to one trading day. Ownership-checked. */
export async function getSessionMarkers(markerDate: string): Promise<SessionMarker[]> {
  const userId = await requireUser();
  return db
    .select()
    .from(sessionMarkers)
    .where(and(eq(sessionMarkers.userId, userId), eq(sessionMarkers.markerDate, markerDate)))
    .orderBy(asc(sessionMarkers.at), asc(sessionMarkers.id));
}

/* -------------------------- performance digest ----------------------------- */

/** Saved digests for one account and period type, newest first. Ownership-checked. */
export async function getDigests(accountId: number, period: DigestPeriod): Promise<PerformanceDigest[]> {
  const userId = await requireUser();
  return db
    .select()
    .from(performanceDigests)
    .where(
      and(
        eq(performanceDigests.userId, userId),
        eq(performanceDigests.accountId, accountId),
        eq(performanceDigests.period, period),
      ),
    )
    .orderBy(desc(performanceDigests.periodStart));
}

/* ------------------------- saved views & columns --------------------------- */

/** Every saved trade-log view for one account. Ownership-checked. */
export async function getTradeViews(accountId: number): Promise<TradeView[]> {
  const userId = await requireUser();
  return db
    .select()
    .from(tradeViews)
    .where(and(eq(tradeViews.userId, userId), eq(tradeViews.accountId, accountId)))
    .orderBy(asc(tradeViews.name));
}

/* ---------------------------- setup templates ------------------------------ */

/** Every setup template owned by the signed-in user. Ownership-checked. */
export async function getTradeTemplates(): Promise<TradeTemplate[]> {
  const userId = await requireUser();
  return db
    .select()
    .from(tradeTemplates)
    .where(eq(tradeTemplates.userId, userId))
    .orderBy(asc(tradeTemplates.name));
}

/** One template by id. Ownership-checked. */
export async function getTradeTemplateById(id: number): Promise<TradeTemplate | null> {
  const userId = await requireUser();
  const [row] = await db
    .select()
    .from(tradeTemplates)
    .where(and(eq(tradeTemplates.id, id), eq(tradeTemplates.userId, userId)))
    .limit(1);
  return row ?? null;
}
