import { db } from "@/db";
import { accounts, journalEntries, trades, type Account, type PublicAccount, type Trade } from "@/db/schema";
import { and, asc, desc, eq, gt, ilike, lt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { requireUser } from "./auth";
import { ensureSeeded } from "./seed";
import { syncAccount } from "./mt5";

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

export type TradeFilters = {
  symbol?: string;
  direction?: "long" | "short";
  outcome?: "win" | "loss" | "be";
  setup?: string;
  review?: "pending" | "reviewed";
  source?: "mt5" | "manual";
};

export async function getTrades(accountId: number, filters: TradeFilters = {}): Promise<Trade[]> {
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

  return db
    .select()
    .from(trades)
    .where(and(...conds))
    .orderBy(desc(sql`coalesce(${trades.closedAt}, ${trades.openedAt})`), desc(trades.id));
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
export async function getTradeById(id: number): Promise<Trade | null> {
  const userId = await requireUser();
  const [row] = await db
    .select()
    .from(trades)
    .where(and(eq(trades.id, id), eq(trades.userId, userId)))
    .limit(1);
  return row ?? null;
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
