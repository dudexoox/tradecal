import type { Account, Trade } from "@/db/schema";
import { dayKey } from "./format";

export type EquityPoint = { index: number; equity: number; date: Date; tradeId: number };

export type DayPnl = { key: string; date: Date; pnl: number; trades: number };

export type Stats = {
  total: number;
  wins: number;
  losses: number;
  breakeven: number;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  winRate: number; // 0..100
  profitFactor: number; // Infinity when no losses
  avgWin: number;
  avgLoss: number; // positive magnitude
  expectancy: number;
  largestWin: number;
  largestLoss: number; // negative or 0
  avgTrade: number;
  /** Number of trades where an R-multiple could be calculated. */
  rTrades: number;
  avgR: number | null;
  totalR: number;
  avgPlannedRR: number | null;
  maxDrawdown: number; // positive magnitude in currency
  maxDrawdownPct: number; // relative to peak balance
  currentStreak: { kind: "win" | "loss" | "none"; count: number };
  equity: EquityPoint[];
  days: DayPnl[];
  bestDay: DayPnl | null;
  worstDay: DayPnl | null;
  balance: number;
  returnPct: number;
  bySymbol: { symbol: string; pnl: number; trades: number; winRate: number }[];
  bySetup: { setup: string; pnl: number; trades: number; winRate: number }[];
  longs: { trades: number; pnl: number; winRate: number };
  shorts: { trades: number; pnl: number; winRate: number };
};

/** Trades sorted chronologically by the time they were closed (or opened if still open). */
export function sortChronologically(list: Trade[]) {
  return [...list].sort((a, b) => effectiveTime(a).getTime() - effectiveTime(b).getTime());
}

export function effectiveTime(t: Trade) {
  return t.closedAt ?? t.openedAt;
}

/**
 * Realised R-multiple. Planned risk wins; otherwise fall back to the
 * entry → stop → exit price move, so old trades without a risk amount still
 * get a useful R when a stop was recorded.
 */
export function tradeR(t: Trade): number | null {
  if (t.riskAmount !== null && t.riskAmount > 0) return t.pnl / t.riskAmount;
  const entry = t.entryPrice;
  const stop = t.stopLoss;
  const exit = t.exitPrice;
  if (entry === null || stop === null || exit === null) return null;
  const risk = Math.abs(entry - stop);
  if (risk <= 0) return null;
  const move = t.direction === "long" ? exit - entry : entry - exit;
  return move / risk;
}

/** Planned reward-to-risk from entry, stop and target. */
export function plannedRR(t: Trade): number | null {
  const entry = t.entryPrice;
  const stop = t.stopLoss;
  const target = t.takeProfit;
  if (entry === null || stop === null || target === null) return null;
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target - entry);
  if (risk <= 0) return null;
  return reward / risk;
}

function group<T extends string>(
  list: Trade[],
  keyOf: (t: Trade) => T | null | undefined,
): { key: T; pnl: number; trades: number; winRate: number }[] {
  const map = new Map<T, { pnl: number; trades: number; wins: number }>();
  for (const t of list) {
    const k = keyOf(t);
    if (!k) continue;
    const g = map.get(k) ?? { pnl: 0, trades: 0, wins: 0 };
    g.pnl += t.pnl;
    g.trades += 1;
    if (t.pnl > 0) g.wins += 1;
    map.set(k, g);
  }
  return [...map.entries()]
    .map(([key, g]) => ({ key, pnl: g.pnl, trades: g.trades, winRate: g.trades ? (g.wins / g.trades) * 100 : 0 }))
    .sort((a, b) => b.pnl - a.pnl);
}

export type PerformanceRow = {
  key: string;
  pnl: number;
  trades: number;
  wins: number;
  winRate: number;
  avgPnl: number;
  totalR: number;
  avgR: number | null;
  rTrades: number;
};

/** Group trades for reports, including R-multiple metrics. */
export function groupPerformance<T extends string>(
  list: Trade[],
  keyOf: (trade: Trade) => T | null | undefined,
): PerformanceRow[] {
  const map = new Map<T, { pnl: number; trades: number; wins: number; totalR: number; rTrades: number }>();
  for (const trade of list) {
    const key = keyOf(trade);
    if (!key) continue;
    const group = map.get(key) ?? { pnl: 0, trades: 0, wins: 0, totalR: 0, rTrades: 0 };
    group.pnl += trade.pnl;
    group.trades += 1;
    if (trade.pnl > 0) group.wins += 1;
    const r = tradeR(trade);
    if (r !== null) {
      group.totalR += r;
      group.rTrades += 1;
    }
    map.set(key, group);
  }
  return [...map.entries()]
    .map(([key, group]) => ({
      key,
      pnl: group.pnl,
      trades: group.trades,
      wins: group.wins,
      winRate: group.trades ? (group.wins / group.trades) * 100 : 0,
      avgPnl: group.trades ? group.pnl / group.trades : 0,
      totalR: group.totalR,
      avgR: group.rTrades ? group.totalR / group.rTrades : null,
      rTrades: group.rTrades,
    }))
    .sort((a, b) => b.pnl - a.pnl);
}

export function computeStats(account: Pick<Account, "startingBalance">, input: Trade[]): Stats {
  const list = sortChronologically(input);
  const start = account.startingBalance;

  let wins = 0;
  let losses = 0;
  let breakeven = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let largestWin = 0;
  let largestLoss = 0;

  const equity: EquityPoint[] = [];
  let running = start;
  let peak = start;
  let maxDd = 0;
  let maxDdPct = 0;

  const dayMap = new Map<string, DayPnl>();

  list.forEach((t, i) => {
    if (t.pnl > 0) {
      wins++;
      grossProfit += t.pnl;
      if (t.pnl > largestWin) largestWin = t.pnl;
    } else if (t.pnl < 0) {
      losses++;
      grossLoss += -t.pnl;
      if (t.pnl < largestLoss) largestLoss = t.pnl;
    } else {
      breakeven++;
    }

    running += t.pnl;
    const when = effectiveTime(t);
    equity.push({ index: i + 1, equity: running, date: when, tradeId: t.id });
    if (running > peak) peak = running;
    const dd = peak - running;
    if (dd > maxDd) {
      maxDd = dd;
      maxDdPct = peak > 0 ? (dd / peak) * 100 : 0;
    }

    const key = dayKey(when);
    const d = dayMap.get(key) ?? {
      key,
      date: new Date(when.getFullYear(), when.getMonth(), when.getDate()),
      pnl: 0,
      trades: 0,
    };
    d.pnl += t.pnl;
    d.trades += 1;
    dayMap.set(key, d);
  });

  const total = list.length;
  const netPnl = grossProfit - grossLoss;
  const winRate = total ? (wins / total) * 100 : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  const avgWin = wins ? grossProfit / wins : 0;
  const avgLoss = losses ? grossLoss / losses : 0;
  const expectancy = total ? netPnl / total : 0;

  let totalR = 0;
  let rTrades = 0;
  let plannedSum = 0;
  let plannedCount = 0;
  for (const trade of list) {
    const r = tradeR(trade);
    if (r !== null) {
      totalR += r;
      rTrades++;
    }
    const planned = plannedRR(trade);
    if (planned !== null) {
      plannedSum += planned;
      plannedCount++;
    }
  }

  // streak from the most recent trade backwards
  let streak: Stats["currentStreak"] = { kind: "none", count: 0 };
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i].pnl;
    if (p === 0) continue;
    const kind: "win" | "loss" = p > 0 ? "win" : "loss";
    if (streak.kind === "none") streak = { kind, count: 1 };
    else if (streak.kind === kind) streak.count++;
    else break;
  }

  const days = [...dayMap.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
  const bestDay = days.reduce<DayPnl | null>((acc, d) => (acc === null || d.pnl > acc.pnl ? d : acc), null);
  const worstDay = days.reduce<DayPnl | null>((acc, d) => (acc === null || d.pnl < acc.pnl ? d : acc), null);

  const sideStats = (side: "long" | "short") => {
    const s = list.filter((t) => t.direction === side);
    const w = s.filter((t) => t.pnl > 0).length;
    return {
      trades: s.length,
      pnl: s.reduce((a, t) => a + t.pnl, 0),
      winRate: s.length ? (w / s.length) * 100 : 0,
    };
  };

  return {
    total,
    wins,
    losses,
    breakeven,
    netPnl,
    grossProfit,
    grossLoss,
    winRate,
    profitFactor,
    avgWin,
    avgLoss,
    expectancy,
    largestWin,
    largestLoss,
    avgTrade: expectancy,
    rTrades,
    avgR: rTrades ? totalR / rTrades : null,
    totalR,
    avgPlannedRR: plannedCount ? plannedSum / plannedCount : null,
    maxDrawdown: maxDd,
    maxDrawdownPct: maxDdPct,
    currentStreak: streak,
    equity,
    days,
    bestDay,
    worstDay,
    balance: start + netPnl,
    returnPct: start > 0 ? (netPnl / start) * 100 : 0,
    bySymbol: group(list, (t) => t.symbol).map(({ key, ...rest }) => ({ symbol: key, ...rest })),
    bySetup: group(list, (t) => t.setup?.trim() || null).map(({ key, ...rest }) => ({ setup: key, ...rest })),
    longs: sideStats("long"),
    shorts: sideStats("short"),
  };
}

export type Objectives = {
  profitTarget: { target: number; current: number; progress: number; hit: boolean };
  maxLoss: { limit: number; used: number; progress: number; breached: boolean };
  maxDailyLoss: { limit: number; worstDay: number; progress: number; breached: boolean; todayPnl: number };
};

/** FTMO-style trading objectives derived from the account configuration. */
export function computeObjectives(
  account: Pick<Account, "startingBalance" | "profitTargetPct" | "maxDailyLossPct" | "maxLossPct">,
  stats: Stats,
): Objectives {
  const start = account.startingBalance;
  const target = (start * account.profitTargetPct) / 100;
  const lossLimit = (start * account.maxLossPct) / 100;
  const dailyLimit = (start * account.maxDailyLossPct) / 100;

  const current = Math.max(0, stats.netPnl);
  const lossUsed = Math.max(0, start - Math.min(...[start, ...stats.equity.map((e) => e.equity)]));
  const worstDay = stats.worstDay ? Math.max(0, -stats.worstDay.pnl) : 0;
  const todayKey = dayKey(new Date());
  const todayPnl = stats.days.find((d) => d.key === todayKey)?.pnl ?? 0;

  const clamp = (n: number) => Math.min(100, Math.max(0, n));

  return {
    profitTarget: {
      target,
      current,
      progress: target > 0 ? clamp((current / target) * 100) : 0,
      hit: target > 0 && stats.netPnl >= target,
    },
    maxLoss: {
      limit: lossLimit,
      used: lossUsed,
      progress: lossLimit > 0 ? clamp((lossUsed / lossLimit) * 100) : 0,
      breached: lossLimit > 0 && lossUsed >= lossLimit,
    },
    maxDailyLoss: {
      limit: dailyLimit,
      worstDay,
      progress: dailyLimit > 0 ? clamp((worstDay / dailyLimit) * 100) : 0,
      breached: dailyLimit > 0 && worstDay >= dailyLimit,
      todayPnl,
    },
  };
}
