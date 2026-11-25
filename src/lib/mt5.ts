/**
 * MetaTrader 5 automatic tracking.
 *
 * Trades are pulled from the broker's history using an MT5 **investor
 * (read-only) password** through the same local Python bridge the Obsidian
 * Forex Journal plugin uses. An investor password can only read balances,
 * positions and history — it can never place, modify or close a trade, so the
 * journal itself stays read-only.
 *
 * The bridge talks to a portable MT5 terminal over IPC and reads the investor
 * password from Windows DPAPI storage (or uses the one saved on the account).
 * No cloud service or API token is required; everything runs on this machine.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { db } from "@/db";
import { accounts, trades, type Account, type TradeDirection } from "@/db/schema";
import { and, eq, like } from "drizzle-orm";

export type SyncMode = "live" | "demo";

export type SyncSummary = {
  ok: boolean;
  mode: SyncMode;
  imported: number;
  updated: number;
  error?: string;
};

export type ImportedTrade = {
  externalId: string;
  symbol: string;
  direction: TradeDirection;
  openedAt: Date;
  closedAt: Date | null;
  entryPrice: number | null;
  exitPrice: number | null;
  size: number | null;
  pnl: number;
  fees: number;
};

/* ------------------------------------------------------------- bridge paths */

const appData = () => process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");

const pythonPath = () =>
  process.env.MT5_PYTHON ?? path.join(appData(), "ForexJournal", "bridge-venv", "Scripts", "python.exe");

const scriptPath = () =>
  process.env.MT5_BRIDGE_SCRIPT ??
  path.resolve(
    process.cwd(),
    "..",
    "obsidian-forex-journal",
    ".obsidian",
    "plugins",
    "forex-journal",
    "bridge",
    "mt5_bridge.py",
  );

const terminalPath = () =>
  process.env.MT5_TERMINAL ?? path.join(appData(), "ForexJournal", "MT5-Terminal", "terminal64.exe");

/** True when the local bridge (Python env + script + portable terminal) is present. */
export function bridgeConfigured(): boolean {
  // Serverless hosts have no local MT5 terminal; sync runs on the desktop agent.
  if (process.env.VERCEL) return false;
  return (
    existsSync(/*turbopackIgnore: true*/ pythonPath()) &&
    existsSync(/*turbopackIgnore: true*/ scriptPath()) &&
    existsSync(/*turbopackIgnore: true*/ terminalPath())
  );
}

type BridgeResponse = { ok: boolean; error?: string; [key: string]: unknown };

/** Runs one JSON request through the bridge and parses its single JSON reply. */
function runBridge(request: Record<string, unknown>): Promise<BridgeResponse> {
  return new Promise((resolve, reject) => {
    const child = spawn(/*turbopackIgnore: true*/ pythonPath(), [scriptPath()], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("The MT5 bridge timed out. Is the portable terminal reachable?"));
    }, 150_000);

    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Could not start the MT5 bridge: ${err.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const text = stdout.trim();
      if (!text) {
        reject(new Error(stderr.trim() || `The MT5 bridge exited (code ${code}) without a response.`));
        return;
      }
      try {
        resolve(JSON.parse(text) as BridgeResponse);
      } catch {
        reject(new Error("The MT5 bridge returned an unreadable response."));
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.write(JSON.stringify(request));
    child.stdin.end();
  });
}

/* ----------------------------------------------------------- snapshot types */

type BridgeAccount = { currency?: string; balance?: number; equity?: number };

type BridgeDeal = {
  ticket?: number;
  position_id?: number;
  type?: number;
  entry?: number;
  symbol?: string;
  volume?: number;
  price?: number;
  profit?: number;
  commission?: number;
  swap?: number;
  fee?: number;
  time?: string;
  comment?: string;
};

type BridgePosition = {
  ticket?: number;
  identifier?: number;
  symbol?: string;
  type?: number;
  volume?: number;
  price_open?: number;
  price_current?: number;
  profit?: number;
  swap?: number;
  time?: string;
};

type Snapshot = {
  account?: BridgeAccount;
  deals?: BridgeDeal[];
  positions?: BridgePosition[];
};

/* ----------------------------------------------------------------- mapping */

/**
 * MT5 cent accounts quote amounts in cents (USC). Store USD instead so every
 * statistic uses the same display currency — mirrors the Obsidian plugin.
 */
function currencyScale(account: BridgeAccount | undefined): number {
  const code = (account?.currency ?? "USD").trim().toUpperCase();
  return code === "USC" ? 0.01 : 1;
}

function round(value: number, digits: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Broker wall-clock strings carry no zone; parse as local time like the plugin. */
function brokerDate(value: string | undefined): Date {
  const parsed = value ? new Date(value) : new Date(NaN);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function sumVolume(deals: BridgeDeal[]): number {
  return deals.reduce((sum, d) => sum + (Number.isFinite(d.volume) ? (d.volume as number) : 0), 0);
}

function weightedPrice(deals: BridgeDeal[]): number | null {
  let volume = 0;
  let total = 0;
  for (const deal of deals) {
    if (!Number.isFinite(deal.volume) || (deal.volume as number) <= 0) continue;
    volume += deal.volume as number;
    total += (deal.price ?? 0) * (deal.volume as number);
  }
  if (volume > 0) return round(total / volume, 5);
  const first = deals.find((d) => Number.isFinite(d.price) && (d.price as number) > 0);
  return first ? round(first.price as number, 5) : null;
}

function earliest(deals: BridgeDeal[], fallback: Date): Date {
  let best = Number.POSITIVE_INFINITY;
  for (const deal of deals) {
    const time = brokerDate(deal.time).getTime();
    if (time < best) best = time;
  }
  return Number.isFinite(best) ? new Date(best) : fallback;
}

function latest(deals: BridgeDeal[], fallback: Date): Date {
  let best = 0;
  for (const deal of deals) {
    const time = brokerDate(deal.time).getTime();
    if (time > best) best = time;
  }
  return best > 0 ? new Date(best) : fallback;
}

function netOf(deals: BridgeDeal[]): number {
  return deals.reduce(
    (sum, d) => sum + (d.profit ?? 0) + (d.commission ?? 0) + (d.swap ?? 0) + (d.fee ?? 0),
    0,
  );
}

function feesOf(deals: BridgeDeal[]): number {
  return Math.abs(deals.reduce((sum, d) => sum + (d.commission ?? 0) + (d.fee ?? 0), 0));
}

/** Groups raw MT5 deals (entry + exit legs) into one journal trade per position. */
function groupDeals(snapshot: Snapshot, scale: number): ImportedTrade[] {
  const openIds = new Set<number>();
  for (const position of snapshot.positions ?? []) {
    const id = position.identifier || position.ticket;
    if (id) openIds.add(id);
  }

  const byPosition = new Map<number, BridgeDeal[]>();
  for (const deal of snapshot.deals ?? []) {
    if (!deal.position_id) continue; // skip balance/deposit operations
    if (deal.type !== 0 && deal.type !== 1) continue;
    if (openIds.has(deal.position_id)) continue; // still open — handled below
    const list = byPosition.get(deal.position_id) ?? [];
    list.push(deal);
    byPosition.set(deal.position_id, list);
  }

  const rows: ImportedTrade[] = [];
  for (const [positionId, legs] of byPosition) {
    const entries = legs.filter((d) => d.entry === 0);
    const exits = legs.filter((d) => d.entry === 1 || d.entry === 3);
    if (exits.length === 0) continue;

    const base = entries[0] ?? legs[0];
    const symbol = (base.symbol || exits[0].symbol || "").trim().toUpperCase();
    if (!symbol) continue;

    const openedAt = earliest(entries.length > 0 ? entries : [base], brokerDate(base.time));
    const closedAt = latest(exits, openedAt);
    const size = Math.max(sumVolume(entries), sumVolume(exits), base.volume ?? 0);

    rows.push({
      externalId: `mt5:${positionId}`,
      symbol,
      direction: base.type === 1 ? "short" : "long",
      openedAt,
      closedAt: closedAt.getTime() > openedAt.getTime() ? closedAt : openedAt,
      entryPrice: weightedPrice(entries.length > 0 ? entries : [base]),
      exitPrice: weightedPrice(exits),
      size: round(size, 2),
      pnl: round(netOf(legs) * scale, 2),
      fees: round(feesOf(legs) * scale, 2),
    });
  }

  for (const position of snapshot.positions ?? []) {
    const id = position.identifier || position.ticket;
    const symbol = (position.symbol || "").trim().toUpperCase();
    if (!id || !symbol) continue;
    rows.push({
      externalId: `mt5:${id}`,
      symbol,
      direction: position.type === 1 ? "short" : "long",
      openedAt: brokerDate(position.time),
      closedAt: null,
      entryPrice: Number.isFinite(position.price_open) ? round(position.price_open as number, 5) : null,
      exitPrice: null,
      size: Number.isFinite(position.volume) ? round(position.volume as number, 2) : null,
      pnl: round((position.profit ?? 0) * scale, 2),
      fees: 0,
    });
  }

  return rows.sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime());
}

async function fetchLocalHistory(account: Account): Promise<ImportedTrade[]> {
  const response = await runBridge({
    action: "sync",
    login: account.mt5Login,
    server: account.mt5Server,
    terminal_path: terminalPath(),
    portable: true,
    // Use the account's saved investor password when present; otherwise the
    // bridge falls back to its own DPAPI-encrypted credentials.
    ...(account.mt5InvestorPassword ? { password: account.mt5InvestorPassword } : {}),
  });
  if (!response.ok) throw new Error(response.error || "The MT5 bridge could not read your history.");

  const snapshot = response as unknown as Snapshot;
  if (!Array.isArray(snapshot.deals)) throw new Error("Unexpected MT5 bridge response while reading deal history.");
  return groupDeals(snapshot, currencyScale(snapshot.account));
}

/* --------------------------------------------------------------- upsert */

async function upsertTrades(account: Account, rows: ImportedTrade[]) {
  const accountId = account.id;
  // Drop any leftover demo rows now that real broker history is available.
  await db.delete(trades).where(and(eq(trades.accountId, accountId), like(trades.externalId, "demo:%")));

  if (rows.length === 0) return { imported: 0, updated: 0 };
  const existing = await db
    .select({ id: trades.id, externalId: trades.externalId })
    .from(trades)
    .where(eq(trades.accountId, accountId));
  const mine = new Map(existing.filter((r) => r.externalId).map((r) => [r.externalId as string, r.id]));

  let imported = 0;
  let updated = 0;
  for (const row of rows) {
    const data = {
      symbol: row.symbol,
      direction: row.direction,
      entryPrice: row.entryPrice,
      exitPrice: row.exitPrice,
      size: row.size,
      pnl: row.pnl,
      fees: row.fees,
      openedAt: row.openedAt,
      closedAt: row.closedAt,
      source: "mt5",
      externalId: row.externalId,
    };
    const id = mine.get(row.externalId);
    if (id) {
      await db.update(trades).set(data).where(eq(trades.id, id));
      updated++;
    } else {
      // Mirrors the owning account so every trade stays scoped to its user.
      await db.insert(trades).values({ ...data, accountId, userId: account.userId });
      imported++;
    }
  }
  return { imported, updated };
}

/** Pulls broker history through the local bridge and writes it into the journal. Idempotent. */
export async function syncAccount(account: Account): Promise<SyncSummary> {
  const mode: SyncMode = "live";

  if (!account.mt5Enabled) return { ok: false, mode, imported: 0, updated: 0, error: "Automatic tracking is switched off." };
  if (!account.mt5Login || !account.mt5Server)
    return { ok: false, mode, imported: 0, updated: 0, error: "Add your MT5 account number and broker server first." };
  if (process.env.VERCEL)
    return {
      ok: false,
      mode,
      imported: 0,
      updated: 0,
      error: "MT5 auto-sync runs on your desktop sync agent; the hosted journal reads the shared database.",
    };
  if (!bridgeConfigured())
    return {
      ok: false,
      mode,
      imported: 0,
      updated: 0,
      error: "The local MT5 bridge is not set up on this machine. Run the Forex Journal bridge setup, then sync again.",
    };

  try {
    const rows = await fetchLocalHistory(account);
    const { imported, updated } = await upsertTrades(account, rows);
    await db
      .update(accounts)
      .set({ mt5Mode: mode, mt5Status: "connected", mt5LastError: null, mt5LastSyncAt: new Date(), mt5LastImported: imported })
      .where(eq(accounts.id, account.id));
    return { ok: true, mode, imported, updated };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not reach MetaTrader 5.";
    await db
      .update(accounts)
      .set({ mt5Mode: mode, mt5Status: "error", mt5LastError: message.slice(0, 300), mt5LastSyncAt: new Date() })
      .where(eq(accounts.id, account.id));
    return { ok: false, mode, imported: 0, updated: 0, error: message };
  }
}
