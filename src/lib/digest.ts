import type { Trade } from "@/db/schema";
import type { DigestMetrics } from "@/db/schema";
import { fmtDateShort } from "./format";
import { effectiveTime, tradeR } from "./stats";

export type DigestInput = {
  period: "week" | "month";
  /** First moment of the period. */
  start: Date;
  /** Last moment of the period (inclusive). */
  end: Date;
  trades: Trade[];
  /** Routine rule checks completed inside the period. */
  rulesDone: number;
  /** Number of active rules during the period. */
  rulesTotal: number;
  currency: string;
};

function money(value: number, currency: string) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(value))}`;
}

function within(trade: Trade, start: Date, end: Date) {
  const when = effectiveTime(trade).getTime();
  return when >= start.getTime() && when <= end.getTime();
}

/**
 * Writes the digest for one period. The text is generated from the trader's
 * own numbers — no outside model involved — so it stays factual and can be
 * regenerated whenever the underlying trades change.
 */
export function buildDigest(input: DigestInput): { summary: string; metrics: DigestMetrics } {
  const { period, start, end, trades, currency } = input;
  const label = period === "week" ? "week" : "month";

  const pnl = Math.round(trades.reduce((sum, trade) => sum + trade.pnl, 0) * 100) / 100;
  const wins = trades.filter((trade) => trade.pnl > 0).length;
  const winRate = trades.length ? Math.round((wins / trades.length) * 1000) / 10 : 0;

  let rSum = 0;
  let rCount = 0;
  for (const trade of trades) {
    const r = tradeR(trade);
    if (r !== null) {
      rSum += r;
      rCount += 1;
    }
  }
  const totalR = rCount ? Math.round(rSum * 100) / 100 : null;
  const avgR = rCount ? Math.round((rSum / rCount) * 100) / 100 : null;

  const byDay = new Map<string, { pnl: number; trades: number }>();
  const bySetup = new Map<string, { pnl: number; trades: number; wins: number }>();
  for (const trade of trades) {
    const when = effectiveTime(trade);
    const key = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, "0")}-${String(when.getDate()).padStart(2, "0")}`;
    const day = byDay.get(key) ?? { pnl: 0, trades: 0 };
    day.pnl += trade.pnl;
    day.trades += 1;
    byDay.set(key, day);

    const setup = trade.setup?.trim() || "Untagged setups";
    const group = bySetup.get(setup) ?? { pnl: 0, trades: 0, wins: 0 };
    group.pnl += trade.pnl;
    group.trades += 1;
    if (trade.pnl > 0) group.wins += 1;
    bySetup.set(setup, group);
  }

  const dayList = [...byDay.entries()].map(([key, value]) => ({ key, ...value }));
  const bestDay = dayList.reduce<{ key: string; pnl: number } | null>((acc, day) => {
    if (!acc) return { key: day.key, pnl: day.pnl };
    return day.pnl > acc.pnl ? { key: day.key, pnl: day.pnl } : acc;
  }, null);
  const worstDay = dayList.reduce<{ key: string; pnl: number } | null>((acc, day) => {
    if (!acc) return { key: day.key, pnl: day.pnl };
    return day.pnl < acc.pnl ? { key: day.key, pnl: day.pnl } : acc;
  }, null);
  const setupList = [...bySetup.entries()]
    .map(([setup, group]) => ({ setup, ...group }))
    .sort((a, b) => b.pnl - a.pnl);
  const bestSetup = setupList[0]?.setup ?? null;

  const rulePct = input.rulesTotal > 0 ? Math.round((input.rulesDone / input.rulesTotal) * 100) : 0;

  const metrics: DigestMetrics = {
    pnl,
    trades: trades.length,
    wins,
    winRate,
    totalR,
    avgR,
    tradingDays: dayList.length,
    bestDay: bestDay ? { key: bestDay.key, pnl: Math.round(bestDay.pnl * 100) / 100 } : null,
    worstDay: worstDay ? { key: worstDay.key, pnl: Math.round(worstDay.pnl * 100) / 100 } : null,
    bestSetup,
    rulesDone: input.rulesDone,
    rulesTotal: input.rulesTotal,
    rulePct,
  };

  if (trades.length === 0) {
    return {
      metrics,
      summary: `No trades were logged during this ${label}, so there is nothing to measure yet. Either the market did not offer a setup, or the trades were not recorded.`,
    };
  }

  const parts: string[] = [];

  const leader = setupList[0];
  if (leader && leader.trades > 0) {
    const setupWinRate = Math.round((leader.wins / leader.trades) * 100);
    parts.push(
      `${leader.setup} led the ${label} with ${leader.trades} ${leader.trades === 1 ? "trade" : "trades"} for ${money(leader.pnl, currency)} (${setupWinRate}% win rate).`,
    );
  }

  const netPart = `Net ${money(pnl, currency)} across ${trades.length} ${trades.length === 1 ? "trade" : "trades"} at a ${winRate}% win rate`;
  parts.push(totalR !== null ? `${netPart}, ${totalR >= 0 ? "+" : "−"}${Math.abs(totalR)}R in total.` : `${netPart}.`);

  if (bestDay && worstDay && bestDay.key !== worstDay.key) {
    parts.push(
      `Best day ${fmtDateShort(new Date(bestDay.key))} (${money(bestDay.pnl, currency)}), worst day ${fmtDateShort(new Date(worstDay.key))} (${money(worstDay.pnl, currency)}).`,
    );
  } else if (bestDay) {
    parts.push(`Every result landed on ${fmtDateShort(new Date(bestDay.key))}, the best day at ${money(bestDay.pnl, currency)}.`);
  }

  if (input.rulesTotal > 0) {
    parts.push(`Routine completion ${rulePct}% (${input.rulesDone} of ${input.rulesTotal} checks).`);
  }

  /* The lesson is the one line the trader should carry forward. */
  let lesson: string;
  if (winRate < 40 && trades.length >= 3) {
    lesson = "The win rate was too low to carry the account — cut the size until the quality of the entries improves.";
  } else if (worstDay && worstDay.pnl <= 0 && bestDay && bestDay.pnl > 0 && worstDay.pnl < bestDay.pnl * -0.6) {
    lesson = "One day did most of the damage — put a hard stop at the daily loss limit and step away after it.";
  } else if (leader && leader.trades >= 2 && leader.wins / leader.trades >= 0.6) {
    lesson = `Repeat ${leader.setup} — it produced the cleanest results in this ${label}.`;
  } else if (totalR !== null && totalR < 0) {
    lesson = "The account gave back more than it made — the edge is not there yet, so protect the balance.";
  } else {
    lesson = "The numbers hold together — keep the process identical and let the sample grow.";
  }
  parts.push(lesson);

  return { summary: parts.join(" "), metrics };
}

/** Monday-based start of the week containing the given date. */
export function startOfWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - offset);
  return start;
}

/** First day of the month containing the given date. */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** The moment right after the given period ends. */
export function endOfPeriod(start: Date, period: "week" | "month"): Date {
  if (period === "week") {
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    end.setMilliseconds(-1);
    return end;
  }
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  end.setMilliseconds(-1);
  return end;
}

/** The trades that belong to a period. */
export function tradesInPeriod(trades: Trade[], start: Date, end: Date): Trade[] {
  return trades.filter((trade) => within(trade, start, end));
}
