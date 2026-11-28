import type { Trade } from "@/db/schema";
import { dayKey } from "./format";
import { effectiveTime, tradeR } from "./stats";

/** The raw goal row as stored in the database. */
export type GoalSettings = {
  profitTarget: number | null;
  dailyLossLimit: number | null;
  maxLossLimit: number | null;
  maxRiskPerTrade: number | null;
  maxRiskPerTradePct: number | null;
  maxTradesPerDay: number | null;
  maxOpenTrades: number | null;
  warnAtPct: number;
};

/** Where a limit came from — set by the trader, or inherited from the account. */
export type GoalSource = "goal" | "account";

export type EffectiveGoals = {
  profitTarget: number;
  dailyLossLimit: number;
  maxLossLimit: number;
  maxRiskPerTrade: number | null;
  maxRiskPerTradePct: number | null;
  maxTradesPerDay: number | null;
  maxOpenTrades: number | null;
  warnAtPct: number;
  sources: {
    profitTarget: GoalSource;
    dailyLossLimit: GoalSource;
    maxLossLimit: GoalSource;
  };
};

/**
 * Merges the trader's explicit amounts with the account's percentage
 * objectives. An amount set on the goals row always wins; otherwise the
 * account's percentage of the starting balance is used.
 */
export function resolveGoals(
  account: {
    startingBalance: number;
    profitTargetPct: number;
    maxDailyLossPct: number;
    maxLossPct: number;
  },
  goals: GoalSettings | null,
): EffectiveGoals {
  const balance = account.startingBalance;
  const fromPct = (pct: number) => Math.round((balance * pct) / 100 * 100) / 100;
  const profitTarget = goals?.profitTarget ?? fromPct(account.profitTargetPct);
  const dailyLossLimit = goals?.dailyLossLimit ?? fromPct(account.maxDailyLossPct);
  const maxLossLimit = goals?.maxLossLimit ?? fromPct(account.maxLossPct);
  return {
    profitTarget,
    dailyLossLimit,
    maxLossLimit,
    maxRiskPerTrade: goals?.maxRiskPerTrade ?? null,
    maxRiskPerTradePct: goals?.maxRiskPerTradePct ?? null,
    maxTradesPerDay: goals?.maxTradesPerDay ?? null,
    maxOpenTrades: goals?.maxOpenTrades ?? null,
    warnAtPct: goals?.warnAtPct ?? 80,
    sources: {
      profitTarget: goals?.profitTarget != null ? "goal" : "account",
      dailyLossLimit: goals?.dailyLossLimit != null ? "goal" : "account",
      maxLossLimit: goals?.maxLossLimit != null ? "goal" : "account",
    },
  };
}

export type GoalState = "ok" | "warn" | "breach" | "hit";

export type GoalStatus = {
  key: "profitTarget" | "dailyLoss" | "maxLoss" | "riskPerTrade" | "tradesPerDay" | "openTrades";
  label: string;
  /** The limit itself, or null when the guardrail is not set. */
  limit: number | null;
  /** How much of the limit is used. */
  used: number;
  /** Percentage of the limit used (may exceed 100). */
  pct: number;
  state: GoalState;
  /** Short, human explanation of the current state. */
  detail: string;
  /** Extra context, e.g. which trade broke the rule. */
  note?: string;
};

export type GoalWarning = {
  level: "warn" | "breach";
  title: string;
  detail: string;
};

function stateFor(pct: number, warnAtPct: number, breached: boolean, hit: boolean): GoalState {
  if (hit) return "hit";
  if (breached) return "breach";
  if (pct >= warnAtPct) return "warn";
  return "ok";
}

/** Net P&L for a given local day. */
export function pnlForDay(trades: Trade[], key: string): number {
  let total = 0;
  for (const trade of trades) {
    if (dayKey(effectiveTime(trade)) === key) total += trade.pnl;
  }
  return Math.round(total * 100) / 100;
}

/** Number of trades closed on a given local day. */
export function tradesForDay(trades: Trade[], key: string): number {
  let count = 0;
  for (const trade of trades) {
    if (dayKey(effectiveTime(trade)) === key) count += 1;
  }
  return count;
}

/**
 * The full guardrail picture for one account: every limit, how much of it is
 * used, and whether the trader is close to (or past) it.
 */
export function computeGoalStatus(
  account: { startingBalance: number },
  goals: EffectiveGoals,
  trades: Trade[],
  todayKey = dayKey(new Date()),
): GoalStatus[] {
  const statuses: GoalStatus[] = [];
  const warnAt = goals.warnAtPct;

  /* ------------------------------ profit target ----------------------------- */
  const netPnl = Math.round(trades.reduce((sum, trade) => sum + trade.pnl, 0) * 100) / 100;
  const targetPct = goals.profitTarget > 0 ? (netPnl / goals.profitTarget) * 100 : 0;
  const targetHit = goals.profitTarget > 0 && netPnl >= goals.profitTarget;
  statuses.push({
    key: "profitTarget",
    label: "Profit target",
    limit: goals.profitTarget,
    used: Math.max(0, netPnl),
    pct: Math.max(0, targetPct),
    state: stateFor(targetPct, warnAt, false, targetHit),
    detail: targetHit
      ? "Target reached."
      : netPnl < 0
        ? "No profit yet — the target is measured from the starting balance."
        : `${Math.max(0, Math.round(targetPct))}% of the target earned.`,
  });

  /* ------------------------------ daily loss limit --------------------------- */
  const todayPnl = pnlForDay(trades, todayKey);
  const dailyUsed = Math.max(0, -todayPnl);
  const dailyPct = goals.dailyLossLimit > 0 ? (dailyUsed / goals.dailyLossLimit) * 100 : 0;
  const dailyBreached = goals.dailyLossLimit > 0 && dailyUsed >= goals.dailyLossLimit;
  statuses.push({
    key: "dailyLoss",
    label: "Daily loss limit",
    limit: goals.dailyLossLimit,
    used: dailyUsed,
    pct: dailyPct,
    state: stateFor(dailyPct, warnAt, dailyBreached, false),
    detail: dailyUsed === 0
      ? "Today is still flat."
      : `${Math.round(dailyPct)}% of today's loss budget used.`,
    note: dailyBreached ? "Limit reached — stop trading for the day." : undefined,
  });

  /* -------------------------------- max loss -------------------------------- */
  let equity = account.startingBalance;
  let lowest = equity;
  for (const trade of [...trades].sort((a, b) => effectiveTime(a).getTime() - effectiveTime(b).getTime())) {
    equity += trade.pnl;
    if (equity < lowest) lowest = equity;
  }
  const lossUsed = Math.max(0, Math.round((account.startingBalance - lowest) * 100) / 100);
  const lossPct = goals.maxLossLimit > 0 ? (lossUsed / goals.maxLossLimit) * 100 : 0;
  const lossBreached = goals.maxLossLimit > 0 && lossUsed >= goals.maxLossLimit;
  statuses.push({
    key: "maxLoss",
    label: "Total loss limit",
    limit: goals.maxLossLimit,
    used: lossUsed,
    pct: lossPct,
    state: stateFor(lossPct, warnAt, lossBreached, false),
    detail: lossUsed === 0
      ? "The account has never dipped below its starting balance."
      : `${Math.round(lossPct)}% of the total loss budget used.`,
    note: lossBreached ? "Total loss limit breached." : undefined,
  });

  /* ------------------------------ risk per trade ----------------------------- */
  if (goals.maxRiskPerTrade !== null || goals.maxRiskPerTradePct !== null) {
    const balance = account.startingBalance + netPnl;
    const limitFromPct = goals.maxRiskPerTradePct !== null
      ? Math.round((balance * goals.maxRiskPerTradePct) / 100 * 100) / 100
      : null;
    const limit = goals.maxRiskPerTrade ?? limitFromPct;
    const breaches = trades.filter((trade) => {
      if (trade.riskAmount === null || trade.riskAmount <= 0) return false;
      if (goals.maxRiskPerTrade !== null && trade.riskAmount > goals.maxRiskPerTrade) return true;
      if (limitFromPct !== null && trade.riskAmount > limitFromPct) return true;
      return false;
    });
    const worst = breaches.reduce((max, trade) => Math.max(max, trade.riskAmount ?? 0), 0);
    const todayBreaches = breaches.filter((trade) => dayKey(effectiveTime(trade)) === todayKey);
    const pct = limit !== null && limit > 0 ? (worst / limit) * 100 : 0;
    statuses.push({
      key: "riskPerTrade",
      label: "Risk per trade",
      limit,
      used: worst,
      pct,
      state: stateFor(pct, warnAt, breaches.length > 0, false),
      detail: breaches.length === 0
        ? "Every trade respected the risk cap."
        : `${breaches.length} ${breaches.length === 1 ? "trade" : "trades"} broke the cap — worst ${worst}.`,
      note: todayBreaches.length > 0 ? "A trade today broke the risk cap." : undefined,
    });
  }

  /* ----------------------------- trades per day ------------------------------ */
  if (goals.maxTradesPerDay !== null) {
    const count = tradesForDay(trades, todayKey);
    const pct = goals.maxTradesPerDay > 0 ? (count / goals.maxTradesPerDay) * 100 : 0;
    const breached = count >= goals.maxTradesPerDay;
    statuses.push({
      key: "tradesPerDay",
      label: "Trades per day",
      limit: goals.maxTradesPerDay,
      used: count,
      pct,
      state: stateFor(pct, warnAt, breached, false),
      detail: `${count} of ${goals.maxTradesPerDay} trades taken today.`,
    });
  }

  /* ------------------------------ open trades -------------------------------- */
  if (goals.maxOpenTrades !== null) {
    const open = trades.filter((trade) => trade.closedAt === null).length;
    const pct = goals.maxOpenTrades > 0 ? (open / goals.maxOpenTrades) * 100 : 0;
    const breached = open >= goals.maxOpenTrades;
    statuses.push({
      key: "openTrades",
      label: "Open trades",
      limit: goals.maxOpenTrades,
      used: open,
      pct,
      state: stateFor(pct, warnAt, breached, false),
      detail: `${open} of ${goals.maxOpenTrades} positions still open.`,
    });
  }

  return statuses;
}

/**
 * The short list of things the trader should act on right now. Breaches come
 * first, then close calls.
 */
export function goalWarnings(statuses: GoalStatus[]): GoalWarning[] {
  const warnings: GoalWarning[] = [];
  for (const status of statuses) {
    if (status.state === "breach") {
      warnings.push({
        level: "breach",
        title: `${status.label} breached`,
        detail: status.note ?? status.detail,
      });
    } else if (status.state === "warn") {
      warnings.push({
        level: "warn",
        title: `${status.label} nearly reached`,
        detail: status.detail,
      });
    }
  }
  return warnings;
}

/** R-multiple totals for a slice of trades — used by the digest writer. */
export function totalR(list: Trade[]) {
  let sum = 0;
  let count = 0;
  for (const trade of list) {
    const r = tradeR(trade);
    if (r !== null) {
      sum += r;
      count += 1;
    }
  }
  return { totalR: count ? Math.round(sum * 100) / 100 : null, rTrades: count };
}
