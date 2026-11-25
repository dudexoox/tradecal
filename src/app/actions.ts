"use server";

import { db } from "@/db";
import {
  ACCOUNT_PHASES,
  MOODS,
  TRADE_DIRECTIONS,
  accounts,
  journalEntries,
  trades,
  type AccountPhase,
  type Mood,
  type TradeDirection,
} from "@/db/schema";
import { ACCOUNT_COOKIE, getActiveAccount, getAccountSecrets } from "@/lib/data";
import { requireUser } from "@/lib/auth";
import { syncAccount } from "@/lib/mt5";
import { normalizeChartLink, removeUpload, saveUpload } from "@/lib/uploads";
import { parseTradeCsv, type CsvTrade } from "@/lib/csv";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type FormState = { error?: string; ok?: boolean } | null;

function str(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function num(fd: FormData, key: string): number | null {
  const raw = str(fd, key).replace(/,/g, "");
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

function dateTime(fd: FormData, key: string): Date | null {
  const raw = str(fd, key);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* ----------------------------- active account ----------------------------- */

export async function setActiveAccount(accountId: number) {
  const userId = await requireUser();
  const [owned] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
    .limit(1);
  if (!owned) return;
  const store = await cookies();
  store.set(ACCOUNT_COOKIE, String(accountId), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}

/* --------------------------------- trades --------------------------------- */

type ParsedTrade = {
  symbol: string;
  direction: TradeDirection;
  entryPrice: number | null;
  exitPrice: number | null;
  size: number | null;
  pnl: number;
  fees: number;
  openedAt: Date;
  closedAt: Date | null;
  setup: string | null;
  rating: number | null;
  notes: string | null;
  chartImageUrl: string | null;
  setupImageUrl: string | null;
  tradingviewUrl: string | null;
  strategyId: number | null;
};

async function parseTrade(fd: FormData): Promise<{ data?: ParsedTrade; error?: string }> {
  const symbol = str(fd, "symbol").toUpperCase();
  if (!symbol) return { error: "Symbol is required." };
  if (symbol.length > 20) return { error: "Symbol is too long." };

  const direction = str(fd, "direction") as TradeDirection;
  if (!TRADE_DIRECTIONS.includes(direction)) return { error: "Choose long or short." };

  const pnl = num(fd, "pnl");
  if (pnl === null || Number.isNaN(pnl)) return { error: "Net P&L is required and must be a number." };

  const openedAt = dateTime(fd, "openedAt");
  if (!openedAt) return { error: "Open time is required." };
  const closedAt = dateTime(fd, "closedAt");
  if (closedAt && closedAt < openedAt) return { error: "Close time cannot be before open time." };

  const entryPrice = num(fd, "entryPrice");
  const exitPrice = num(fd, "exitPrice");
  const size = num(fd, "size");
  const fees = num(fd, "fees") ?? 0;
  for (const [label, v] of [
    ["Entry price", entryPrice],
    ["Exit price", exitPrice],
    ["Size", size],
    ["Fees", fees],
  ] as const) {
    if (v !== null && Number.isNaN(v)) return { error: `${label} must be a number.` };
  }

  const ratingRaw = num(fd, "rating");
  const rating = ratingRaw === null || Number.isNaN(ratingRaw) ? null : Math.min(5, Math.max(1, Math.round(ratingRaw)));

  const setup = str(fd, "setup") || null;
  const notes = str(fd, "notes") || null;

  /* Chart & setup media: keep what's already attached unless explicitly removed. */
  const link = normalizeChartLink(str(fd, "tradingviewUrl"));
  if (link.error) return { error: link.error };

  let chartImageUrl = str(fd, "existingChartImage") || null;
  let setupImageUrl = str(fd, "existingSetupImage") || null;
  if (fd.get("removeChart") === "on") chartImageUrl = null;
  if (fd.get("removeSetup") === "on") setupImageUrl = null;

  const chartFile = fd.get("chartImage");
  if (chartFile instanceof File && chartFile.size > 0) {
    const saved = await saveUpload(chartFile);
    if ("error" in saved) return { error: `Chart screenshot: ${saved.error}` };
    chartImageUrl = saved.url;
  }
  const setupFile = fd.get("setupImage");
  if (setupFile instanceof File && setupFile.size > 0) {
    const saved = await saveUpload(setupFile);
    if ("error" in saved) return { error: `Setup picture: ${saved.error}` };
    setupImageUrl = saved.url;
  }

  /* The strategy chosen from the playbook (empty = unlinked). */
  const strategyRaw = num(fd, "strategyId");
  const strategyId =
    strategyRaw === null || Number.isNaN(strategyRaw) || strategyRaw <= 0 ? null : Math.round(strategyRaw);

  return {
    data: {
      symbol, direction, entryPrice, exitPrice, size, pnl, fees, openedAt, closedAt, setup, rating, notes,
      chartImageUrl, setupImageUrl, tradingviewUrl: link.url ?? null, strategyId,
    },
  };
}

export async function createTrade(_prev: FormState, fd: FormData): Promise<FormState> {
  const userId = await requireUser();
  const parsed = await parseTrade(fd);
  if (!parsed.data) return { error: parsed.error };

  const accountIdRaw = Number(str(fd, "accountId"));
  const { account } = await getActiveAccount();
  const chosenId = Number.isFinite(accountIdRaw) && accountIdRaw > 0 ? accountIdRaw : account?.id;
  if (!chosenId) return { error: "Create an account before logging trades." };
  // Only the owner's accounts can receive trades.
  const [owned] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, chosenId), eq(accounts.userId, userId)))
    .limit(1);
  if (!owned) return { error: "Account not found." };

  await db.insert(trades).values({ ...parsed.data, accountId: owned.id, userId });
  revalidatePath("/", "layout");
  redirect("/trades");
}

export async function updateTrade(id: number, _prev: FormState, fd: FormData): Promise<FormState> {
  const userId = await requireUser();
  const [previous] = await db
    .select({ chartImageUrl: trades.chartImageUrl, setupImageUrl: trades.setupImageUrl })
    .from(trades)
    .where(and(eq(trades.id, id), eq(trades.userId, userId)))
    .limit(1);
  if (!previous) return { error: "Trade not found." };

  const parsed = await parseTrade(fd);
  if (!parsed.data) return { error: parsed.error };

  await db.update(trades).set(parsed.data).where(and(eq(trades.id, id), eq(trades.userId, userId)));

  // Tidy up files that were replaced or removed.
  for (const old of [previous.chartImageUrl, previous.setupImageUrl]) {
    if (old && old !== parsed.data.chartImageUrl && old !== parsed.data.setupImageUrl) void removeUpload(old);
  }
  revalidatePath("/", "layout");
  redirect(`/trades/${id}`);
}

export async function deleteTrade(id: number) {
  const userId = await requireUser();
  const [previous] = await db
    .select({ chartImageUrl: trades.chartImageUrl, setupImageUrl: trades.setupImageUrl })
    .from(trades)
    .where(and(eq(trades.id, id), eq(trades.userId, userId)))
    .limit(1);
  if (!previous) {
    revalidatePath("/", "layout");
    redirect("/trades");
  }
  await db.delete(trades).where(and(eq(trades.id, id), eq(trades.userId, userId)));
  void removeUpload(previous.chartImageUrl);
  void removeUpload(previous.setupImageUrl);
  revalidatePath("/", "layout");
  redirect("/trades");
}

/* --------------------------------- journal -------------------------------- */

export async function saveJournalEntry(_prev: FormState, fd: FormData): Promise<FormState> {
  const userId = await requireUser();
  const entryDate = str(fd, "entryDate");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) return { error: "Pick a valid date." };
  const content = str(fd, "content");
  if (!content) return { error: "Write something first." };
  const moodRaw = str(fd, "mood") as Mood;
  const mood = MOODS.includes(moodRaw) ? moodRaw : null;

  await db
    .insert(journalEntries)
    .values({ userId, entryDate, content, mood })
    .onConflictDoUpdate({
      target: [journalEntries.userId, journalEntries.entryDate],
      set: { content, mood, updatedAt: new Date() },
    });
  revalidatePath("/", "layout");
  if (str(fd, "returnTo") === "day-view") redirect(`/day-view?date=${entryDate}&saved=1`);
  redirect("/journal?saved=1");
}

export async function deleteJournalEntry(id: number) {
  const userId = await requireUser();
  await db
    .delete(journalEntries)
    .where(and(eq(journalEntries.id, id), eq(journalEntries.userId, userId)));
  revalidatePath("/", "layout");
}

/* --------------------------------- accounts ------------------------------- */

type AccountInput = {
  name: string;
  phase: AccountPhase;
  currency: string;
  startingBalance: number;
  profitTargetPct: number;
  maxDailyLossPct: number;
  maxLossPct: number;
  mt5Enabled: boolean;
  mt5Login: string | null;
  mt5Server: string | null;
  mt5InvestorPassword: string | null;
};

function parseAccount(fd: FormData, opts: { requireMt5Password: boolean }): { data?: AccountInput; error?: string } {
  const name = str(fd, "name");
  if (!name) return { error: "Account name is required." };
  const phase = str(fd, "phase") as AccountPhase;
  if (!ACCOUNT_PHASES.includes(phase)) return { error: "Choose a valid phase." };
  const currency = (str(fd, "currency") || "USD").toUpperCase().slice(0, 3);
  const startingBalance = num(fd, "startingBalance");
  if (startingBalance === null || Number.isNaN(startingBalance) || startingBalance <= 0)
    return { error: "Starting balance must be a positive number." };
  const pct = (key: string, fallback: number) => {
    const v = num(fd, key);
    if (v === null) return fallback;
    return Number.isNaN(v) || v < 0 || v > 100 ? NaN : v;
  };
  const profitTargetPct = pct("profitTargetPct", 10);
  const maxDailyLossPct = pct("maxDailyLossPct", 5);
  const maxLossPct = pct("maxLossPct", 10);
  if ([profitTargetPct, maxDailyLossPct, maxLossPct].some(Number.isNaN))
    return { error: "Objectives must be percentages between 0 and 100." };

  /* MetaTrader 5 — investor (read-only) connection */
  const mt5Enabled = str(fd, "mt5Enabled") === "on";
  const mt5Login = str(fd, "mt5Login").replace(/\D/g, "");
  const mt5Server = str(fd, "mt5Server");
  const mt5InvestorPassword = str(fd, "mt5InvestorPassword");
  if (mt5Enabled) {
    if (!mt5Login) return { error: "Automatic tracking: enter your MT5 account number." };
    if (!mt5Server) return { error: "Automatic tracking: enter your broker server name (e.g. ICMarkets-Demo)." };
    if (!mt5InvestorPassword && opts.requireMt5Password)
      return { error: "Automatic tracking: enter the read-only investor password." };
  }

  return {
    data: {
      name, phase, currency, startingBalance, profitTargetPct, maxDailyLossPct, maxLossPct,
      mt5Enabled,
      mt5Login: mt5Enabled ? mt5Login : null,
      mt5Server: mt5Enabled ? mt5Server : null,
      // blank password on edit = keep the saved one
      mt5InvestorPassword: mt5InvestorPassword || null,
    },
  };
}

export async function createAccount(_prev: FormState, fd: FormData): Promise<FormState> {
  const userId = await requireUser();
  const parsed = parseAccount(fd, { requireMt5Password: false });
  if (!parsed.data) return { error: parsed.error };

  // The method is derived from what the form actually carries: a CSV file,
  // MT5 credentials switched on, or neither (manual entry).
  const csvFile = fd.get("csvFile");
  const hasCsv = csvFile instanceof File && csvFile.size > 0;
  const method: "csv" | "mt5" | "manual" = hasCsv ? "csv" : parsed.data.mt5Enabled ? "mt5" : "manual";

  if (method === "mt5") {
    if (!parsed.data.mt5Login || !parsed.data.mt5Server)
      return { error: "Automatic tracking: enter your MT5 account number and broker server." };
    if (!parsed.data.mt5InvestorPassword)
      return { error: "Automatic tracking: enter the read-only investor password." };
  }

  /* CSV — validated before the account exists, so a bad file can't leave an empty account behind. */
  let csvRows: CsvTrade[] = [];
  if (method === "csv" && csvFile instanceof File) {
    const text = await csvFile.text();
    const result = parseTradeCsv(text, { defaultSymbol: str(fd, "csvDefaultSymbol") });
    if (result.error) return { error: result.error };
    if (result.rows.length === 0) return { error: "No trades could be read from that file." };
    csvRows = result.rows;
  }

  const [row] = await db.insert(accounts).values({ ...parsed.data, userId }).returning();
  const store = await cookies();
  store.set(ACCOUNT_COOKIE, String(row.id), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });

  if (method === "csv") {
    await db
      .insert(trades)
      .values(csvRows.map((t) => ({ ...t, accountId: row.id, userId, source: "csv" as const })));
    revalidatePath("/", "layout");
    redirect(`/accounts?added=${csvRows.length}&via=csv`);
  }

  if (method === "mt5") {
    const result = await syncAccount(row);
    revalidatePath("/", "layout");
    if (!result.ok) redirect("/accounts?syncError=1");
    redirect(`/accounts?added=${result.imported}&via=mt5`);
  }

  revalidatePath("/", "layout");
  redirect("/accounts");
}

export async function updateAccount(id: number, _prev: FormState, fd: FormData): Promise<FormState> {
  const userId = await requireUser();
  const parsed = parseAccount(fd, { requireMt5Password: false });
  if (!parsed.data) return { error: parsed.error };
  // Ownership-checked lookup: someone else's account is "not found".
  const previous = await getAccountSecrets(id);
  if (!previous) return { error: "Account not found." };

  const { mt5InvestorPassword, ...rest } = parsed.data;
  const set: Partial<typeof accounts.$inferInsert> = { ...rest };
  if (mt5InvestorPassword) set.mt5InvestorPassword = mt5InvestorPassword;
  if (rest.mt5Enabled && !mt5InvestorPassword && !previous.mt5InvestorPassword) {
    return { error: "Automatic tracking: enter the read-only investor password." };
  }
  // New MT5 login/server → the cached bridge no longer matches this account.
  if (rest.mt5Login !== previous.mt5Login || rest.mt5Server !== previous.mt5Server) {
    set.mt5ApiAccountId = null;
    set.mt5Status = "idle";
    set.mt5LastError = null;
    set.mt5LastSyncAt = null;
  }
  if (!rest.mt5Enabled) {
    set.mt5Status = "idle";
    set.mt5LastError = null;
  }

  await db.update(accounts).set(set).where(and(eq(accounts.id, id), eq(accounts.userId, userId)));
  revalidatePath("/", "layout");
  redirect("/accounts");
}

/* ------------------------------- MT5 sync ------------------------------- */

export type SyncState = { ok: boolean; message: string } | null;

/** "Sync now" — pulls fresh broker history for one connected MT5 account. */
export async function syncMt5Account(accountId: number, _prev: SyncState, _fd: FormData): Promise<SyncState> {
  const account = await getAccountSecrets(accountId);
  if (!account) return { ok: false, message: "Account not found." };
  const result = await syncAccount(account);
  revalidatePath("/", "layout");
  if (!result.ok) return { ok: false, message: result.error ?? "Sync failed." };
  const suffix = " · from MetaTrader 5";
  if (result.imported === 0 && result.updated === 0) return { ok: true, message: `Up to date — nothing new${suffix}` };
  if (result.imported === 0)
    return { ok: true, message: `Up to date · ${result.updated} trades refreshed${suffix}` };
  return { ok: true, message: `${result.imported} new · ${result.updated} updated${suffix}` };
}

export async function deleteAccount(id: number) {
  const userId = await requireUser();
  await db.delete(accounts).where(and(eq(accounts.id, id), eq(accounts.userId, userId)));
  const store = await cookies();
  if (store.get(ACCOUNT_COOKIE)?.value === String(id)) store.delete(ACCOUNT_COOKIE);
  revalidatePath("/", "layout");
  redirect("/accounts");
}
