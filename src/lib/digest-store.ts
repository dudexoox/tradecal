import { db } from "@/db";
import { performanceDigests, type DigestPeriod, type PerformanceDigest, type Trade } from "@/db/schema";
import { buildDigest, endOfPeriod, startOfMonth, startOfWeek, tradesInPeriod } from "./digest";
import { and, desc, eq } from "drizzle-orm";

export function periodStarts(period: DigestPeriod, count: number, today = new Date()): Date[] {
  const starts: Date[] = [];
  if (period === "week") {
    let cursor = startOfWeek(today);
    for (let index = 0; index < count; index++) {
      starts.push(new Date(cursor));
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 7);
    }
  } else {
    let cursor = startOfMonth(today);
    for (let index = 0; index < count; index++) {
      starts.push(new Date(cursor));
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
    }
  }
  return starts.reverse();
}

function key(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Writes the digests for the recent periods and keeps them up to date. The
 * generated text is replaced whenever the underlying trades change, but the
 * trader's own note is never touched.
 */
export async function ensureDigests(options: {
  userId: string;
  accountId: number;
  period: DigestPeriod;
  currency: string;
  trades: Trade[];
  history: Map<string, { checked: number }>;
  activeRules: number;
  count: number;
}): Promise<PerformanceDigest[]> {
  const { userId, accountId, period, currency, trades, history, activeRules, count } = options;
  const starts = periodStarts(period, count);

  for (const start of starts) {
    const end = endOfPeriod(start, period);
    const periodTrades = tradesInPeriod(trades, start, end);

    let rulesDone = 0;
    let rulesTotal = 0;
    const cursor = new Date(start);
    while (cursor <= end) {
      const checked = history.get(key(cursor))?.checked ?? 0;
      if (checked > 0) {
        rulesDone += checked;
        rulesTotal += activeRules;
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    const { summary, metrics } = buildDigest({
      period,
      start,
      end,
      trades: periodTrades,
      rulesDone,
      rulesTotal,
      currency,
    });

    const periodStart = key(start);
    const [existing] = await db
      .select({ id: performanceDigests.id, summary: performanceDigests.summary })
      .from(performanceDigests)
      .where(
        and(
          eq(performanceDigests.userId, userId),
          eq(performanceDigests.accountId, accountId),
          eq(performanceDigests.period, period),
          eq(performanceDigests.periodStart, periodStart),
        ),
      )
      .limit(1);

    if (!existing) {
      await db.insert(performanceDigests).values({
        userId,
        accountId,
        period,
        periodStart,
        summary,
        metrics,
      });
    } else if (existing.summary !== summary) {
      await db
        .update(performanceDigests)
        .set({ summary, metrics, updatedAt: new Date() })
        .where(eq(performanceDigests.id, existing.id));
    }
  }

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
