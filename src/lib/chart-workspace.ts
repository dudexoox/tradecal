import type { ChartTimeframe } from "@/db/schema";

/** One OHLC bar. `time` is the bar open time in unix seconds (UTC). */
export type ChartCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

/** Everything the chart needs to know about the trade it is showing. */
export type ChartTradeMeta = {
  id: number;
  symbol: string;
  direction: "long" | "short";
  openedAt: string;
  closedAt: string | null;
  entryPrice: number | null;
  exitPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  size: number | null;
  riskAmount: number | null;
  pnl: number;
  currency: string;
  accountName?: string;
  setup?: string | null;
  notes?: string | null;
  rating?: number | null;
};

export const CHART_TIMEFRAMES: {
  value: ChartTimeframe;
  label: string;
  short: string;
  minutes: number;
}[] = [
  { value: "M5", label: "5 minutes", short: "M5", minutes: 5 },
  { value: "M15", label: "15 minutes", short: "M15", minutes: 15 },
  { value: "H1", label: "1 hour", short: "H1", minutes: 60 },
  { value: "H4", label: "4 hours", short: "H4", minutes: 240 },
  { value: "D1", label: "1 day", short: "D1", minutes: 1440 },
];

export const CHART_STYLES = ["candles", "line", "area"] as const;
export type ChartStyle = (typeof CHART_STYLES)[number];

export const REPLAY_SPEEDS = [0.5, 1, 2, 4] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];

/** How many bars stay on screen while the replay walks forward. */
export const REPLAY_WINDOW = 70;
/** Bars of context kept before the entry when a replay starts. */
export const REPLAY_LEAD = 12;
/** Bars of context kept after the exit when a replay starts. */
export const REPLAY_TAIL = 12;

export function timeframeMinutes(tf: ChartTimeframe): number {
  return CHART_TIMEFRAMES.find((t) => t.value === tf)?.minutes ?? 15;
}

/** Pick a sensible starting timeframe from how long the trade was open. */
export function defaultTimeframe(trade: ChartTradeMeta): ChartTimeframe {
  const open = Date.parse(trade.openedAt);
  const end = trade.closedAt ? Date.parse(trade.closedAt) : Date.now();
  const hours = Math.max(0, (end - open) / 3_600_000);
  if (hours <= 2) return "M5";
  if (hours <= 8) return "M15";
  if (hours <= 48) return "H1";
  if (hours <= 7 * 24) return "H4";
  return "D1";
}

/** Index of the last bar that opened at or before `seconds` (binary search). */
export function barIndexAt(candles: ChartCandle[], seconds: number): number {
  if (candles.length === 0) return -1;
  let lo = 0;
  let hi = candles.length - 1;
  let found = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid].time <= seconds) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** The time of the bar closest to `seconds` — drawings snap to the bars. */
export function nearestBarTime(candles: ChartCandle[], seconds: number): number {
  if (candles.length === 0) return seconds;
  const index = Math.max(0, Math.min(candles.length - 1, barIndexAt(candles, seconds)));
  const before = candles[index];
  const after = candles[Math.min(index + 1, candles.length - 1)];
  if (!after || after === before) return before.time;
  return Math.abs(after.time - seconds) < Math.abs(seconds - before.time) ? after.time : before.time;
}

/**
 * Money earned per unit of price movement. Taken from the realised result
 * (entry → exit) so the running P&L matches what the broker paid; falls back
 * to the planned risk when a trade is still open.
 */
export function moneyPerPriceUnit(trade: ChartTradeMeta): number | null {
  const entry = trade.entryPrice;
  if (entry === null) return null;
  if (trade.exitPrice !== null && trade.exitPrice !== entry) {
    const move = trade.direction === "long" ? trade.exitPrice - entry : entry - trade.exitPrice;
    if (move !== 0) return trade.pnl / move;
  }
  if (trade.stopLoss !== null && trade.riskAmount !== null && trade.riskAmount > 0) {
    const risk = Math.abs(entry - trade.stopLoss);
    if (risk > 0) return trade.riskAmount / risk;
  }
  return null;
}

/** Realised R-multiple, mirroring the journal maths. */
export function chartTradeR(trade: ChartTradeMeta): number | null {
  if (trade.riskAmount !== null && trade.riskAmount > 0) return trade.pnl / trade.riskAmount;
  const { entryPrice: entry, stopLoss: stop, exitPrice: exit } = trade;
  if (entry === null || stop === null || exit === null) return null;
  const risk = Math.abs(entry - stop);
  if (risk <= 0) return null;
  const move = trade.direction === "long" ? exit - entry : entry - exit;
  return move / risk;
}

/** Planned reward-to-risk from entry, stop and target. */
export function chartPlannedRR(trade: ChartTradeMeta): number | null {
  const { entryPrice: entry, stopLoss: stop, takeProfit: target } = trade;
  if (entry === null || stop === null || target === null) return null;
  const risk = Math.abs(entry - stop);
  if (risk <= 0) return null;
  return Math.abs(target - entry) / risk;
}

/** Where the replay starts and stops for one trade. */
export type ReplayPlan = {
  entryIndex: number;
  exitIndex: number;
  startIndex: number;
  endIndex: number;
};

export function replayPlan(candles: ChartCandle[], trade: ChartTradeMeta): ReplayPlan | null {
  if (candles.length === 0) return null;
  const openSec = Math.floor(Date.parse(trade.openedAt) / 1000);
  const closeSec = trade.closedAt ? Math.floor(Date.parse(trade.closedAt) / 1000) : null;
  const entryIndex = Math.max(0, barIndexAt(candles, openSec));
  const exitIndex = closeSec === null ? candles.length - 1 : Math.max(entryIndex, barIndexAt(candles, closeSec));
  return {
    entryIndex,
    exitIndex,
    startIndex: Math.max(0, entryIndex - REPLAY_LEAD),
    endIndex: Math.min(candles.length - 1, exitIndex + REPLAY_TAIL),
  };
}

/**
 * Broker candles are pulled by symbol and time window, so a trade that was
 * logged at a different price level (a demo trade, an import with rounded
 * prices) can sit far away from the synced candles. When that happens the
 * chart shifts the series by a constant offset so the entry, stop and exit
 * line up with the price action instead of floating off the chart.
 */
export function chartPriceOffset(candles: ChartCandle[], trade: ChartTradeMeta): number {
  const entry = trade.entryPrice;
  if (entry === null || candles.length === 0) return 0;
  const openSec = Math.floor(Date.parse(trade.openedAt) / 1000);
  const bar = candles[Math.max(0, barIndexAt(candles, openSec))];
  if (!bar) return 0;
  const tolerance = Math.max((bar.high - bar.low) * 0.6, Math.abs(entry) * 0.00005);
  if (entry >= bar.low - tolerance && entry <= bar.high + tolerance) return 0;
  return entry - bar.close;
}

/** Move a candle series onto the trade's price level. */
export function shiftCandles(candles: ChartCandle[], offset: number): ChartCandle[] {
  if (offset === 0) return candles;
  return candles.map((c) => ({
    time: c.time,
    open: c.open + offset,
    high: c.high + offset,
    low: c.low + offset,
    close: c.close + offset,
  }));
}
