import type { DayPnl } from "./stats";
import { dayKey } from "./format";
import { tradeR } from "./stats";
import type { Trade } from "@/db/schema";

export type YearDay = {
  key: string;
  date: Date;
  pnl: number;
  trades: number;
  /** False for the padding days that belong to the neighbouring year. */
  inYear: boolean;
  inFuture: boolean;
};

export type YearMonth = {
  month: number;
  label: string;
  pnl: number;
  trades: number;
  wins: number;
  winRate: number;
  tradingDays: number;
  totalR: number | null;
  avgR: number | null;
  bestDay: DayPnl | null;
  worstDay: DayPnl | null;
};

export type YearSummary = {
  year: number;
  pnl: number;
  trades: number;
  wins: number;
  winRate: number;
  tradingDays: number;
  profitableDays: number;
  losingDays: number;
  bestDay: DayPnl | null;
  worstDay: DayPnl | null;
  totalR: number | null;
  avgR: number | null;
  bestMonth: YearMonth | null;
  worstMonth: YearMonth | null;
  months: YearMonth[];
  weeks: YearDay[][];
};

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Builds the calendar grid for a year: one column per week (Monday first)
 * and one row per weekday, plus a per-month summary.
 */
export function buildYear(year: number, days: DayPnl[], trades: Trade[] = []): YearSummary {
  const map = new Map(days.map((day) => [day.key, day]));
  const todayKey = dayKey(new Date());

  const first = new Date(year, 0, 1);
  const last = new Date(year, 11, 31);
  const leading = (first.getDay() + 6) % 7;
  const start = startOfDay(first);
  start.setDate(start.getDate() - leading);
  const totalCells = Math.ceil((leading + (last.getTime() - first.getTime()) / 86_400_000 + 1) / 7) * 7;

  const cells: YearDay[] = [];
  for (let index = 0; index < totalCells; index++) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = dayKey(date);
    const day = map.get(key);
    cells.push({
      key,
      date,
      pnl: day?.pnl ?? 0,
      trades: day?.trades ?? 0,
      inYear: date.getFullYear() === year,
      inFuture: key > todayKey,
    });
  }

  const weeks: YearDay[][] = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));

  const monthDays = (month: number) =>
    days.filter((day) => day.date.getFullYear() === year && day.date.getMonth() === month);

  const months: YearMonth[] = MONTH_LABELS.map((label, month) => {
    const list = monthDays(month);
    const pnl = Math.round(list.reduce((sum, day) => sum + day.pnl, 0) * 100) / 100;
    const tradeCount = list.reduce((sum, day) => sum + day.trades, 0);
    const monthTrades = trades.filter((trade) => {
      const when = trade.closedAt ?? trade.openedAt;
      return when.getFullYear() === year && when.getMonth() === month;
    });
    const wins = monthTrades.filter((trade) => trade.pnl > 0).length;
    let rSum = 0;
    let rCount = 0;
    for (const trade of monthTrades) {
      const r = tradeR(trade);
      if (r !== null) {
        rSum += r;
        rCount += 1;
      }
    }
    return {
      month,
      label,
      pnl,
      trades: tradeCount,
      wins,
      winRate: tradeCount ? (wins / tradeCount) * 100 : 0,
      tradingDays: list.length,
      totalR: rCount ? Math.round(rSum * 100) / 100 : null,
      avgR: rCount ? Math.round((rSum / rCount) * 100) / 100 : null,
      bestDay: list.reduce<DayPnl | null>((acc, day) => (acc === null || day.pnl > acc.pnl ? day : acc), null),
      worstDay: list.reduce<DayPnl | null>((acc, day) => (acc === null || day.pnl < acc.pnl ? day : acc), null),
    };
  });

  const yearDays = days.filter((day) => day.date.getFullYear() === year);
  const yearTrades = trades.filter((trade) => {
    const when = trade.closedAt ?? trade.openedAt;
    return when.getFullYear() === year;
  });
  const wins = yearTrades.filter((trade) => trade.pnl > 0).length;
  let rSum = 0;
  let rCount = 0;
  for (const trade of yearTrades) {
    const r = tradeR(trade);
    if (r !== null) {
      rSum += r;
      rCount += 1;
    }
  }
  const pnl = Math.round(yearDays.reduce((sum, day) => sum + day.pnl, 0) * 100) / 100;

  const active = months.filter((month) => month.trades > 0);
  const bestMonth = active.reduce<YearMonth | null>(
    (acc, month) => (acc === null || month.pnl > acc.pnl ? month : acc),
    null,
  );
  const worstMonth = active.reduce<YearMonth | null>(
    (acc, month) => (acc === null || month.pnl < acc.pnl ? month : acc),
    null,
  );

  return {
    year,
    pnl,
    trades: yearTrades.length,
    wins,
    winRate: yearTrades.length ? (wins / yearTrades.length) * 100 : 0,
    tradingDays: yearDays.length,
    profitableDays: yearDays.filter((day) => day.pnl > 0).length,
    losingDays: yearDays.filter((day) => day.pnl < 0).length,
    bestDay: yearDays.reduce<DayPnl | null>((acc, day) => (acc === null || day.pnl > acc.pnl ? day : acc), null),
    worstDay: yearDays.reduce<DayPnl | null>((acc, day) => (acc === null || day.pnl < acc.pnl ? day : acc), null),
    totalR: rCount ? Math.round(rSum * 100) / 100 : null,
    avgR: rCount ? Math.round((rSum / rCount) * 100) / 100 : null,
    bestMonth,
    worstMonth,
    months,
    weeks,
  };
}

/** The colour band for a day's P&L — five levels each way. */
export function pnlLevel(pnl: number, scale: number): -4 | -3 | -2 | -1 | 0 | 1 | 2 | 3 | 4 {
  if (pnl === 0) return 0;
  const ratio = pnl / scale;
  if (ratio >= 1) return 4;
  if (ratio >= 0.5) return 3;
  if (ratio >= 0.2) return 2;
  if (ratio > 0) return 1;
  if (ratio <= -1) return -4;
  if (ratio <= -0.5) return -3;
  if (ratio <= -0.2) return -2;
  return -1;
}
