import type { Trade } from "@/db/schema";
import { effectiveTime } from "./stats";

export function filterPeriod(trades: Trade[], period?: string) {
  const now = new Date();
  let from: Date | null = null;
  if (period === "month") from = new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === "30days") { from = new Date(now); from.setDate(from.getDate()-30); from.setHours(0,0,0,0); }
  if (!from) return trades;
  const start = from.getTime();
  return trades.filter((t) => effectiveTime(t).getTime() >= start && effectiveTime(t).getTime() <= now.getTime());
}

export function parseDay(raw: string | undefined): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y,m,d] = raw.split("-").map(Number);
  if (y < 1900 || y > 2200) return null;
  const day = new Date(y, m-1, d);
  return day.getFullYear()===y && day.getMonth()===m-1 && day.getDate()===d ? day : null;
}
