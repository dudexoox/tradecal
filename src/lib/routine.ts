import { db } from "@/db";
import { RULE_STAGES, tradingRules, type RuleStage, type TradingRule } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { dayKey } from "./format";

/** A small, opinionated starting routine — editable from the Start My Day page. */
const DEFAULT_RULES: { stage: RuleStage; title: string; description: string; sortOrder: number }[] = [
  {
    stage: "prepare",
    title: "Reviewed the economic calendar",
    description: "No red-folder event inside my trading window.",
    sortOrder: 1,
  },
  {
    stage: "prepare",
    title: "Marked key levels and my bias",
    description: "I know where price is reacting before the session starts.",
    sortOrder: 2,
  },
  {
    stage: "trade",
    title: "Only traded setups from my playbook",
    description: "No improvised entries, however good the chart looks.",
    sortOrder: 3,
  },
  {
    stage: "trade",
    title: "Kept risk within my plan",
    description: "Planned risk per trade and daily loss limit respected.",
    sortOrder: 4,
  },
  {
    stage: "trade",
    title: "Stopped at my daily loss limit",
    description: "No revenge trades after the limit is hit.",
    sortOrder: 5,
  },
  {
    stage: "reflect",
    title: "Journaled every trade",
    description: "Every trade has a review, not just a P&L.",
    sortOrder: 6,
  },
  {
    stage: "reflect",
    title: "Reviewed what worked and what didn't",
    description: "One lesson captured for tomorrow.",
    sortOrder: 7,
  },
];

export async function ensureDefaultRules(userId: string): Promise<void> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tradingRules)
    .where(eq(tradingRules.userId, userId));
  if ((row?.count ?? 0) > 0) return;
  await db
    .insert(tradingRules)
    .values(DEFAULT_RULES.map((rule) => ({ ...rule, userId })))
    .onConflictDoNothing();
}

export type StageProgress = { stage: RuleStage; total: number; done: number; pct: number };

export type RoutineProgress = {
  active: TradingRule[];
  done: number;
  total: number;
  pct: number;
  byStage: StageProgress[];
};

export function routineProgress(rules: TradingRule[], checkedIds: number[]): RoutineProgress {
  const active = rules.filter((rule) => rule.active);
  const checked = new Set(checkedIds);
  const done = active.filter((rule) => checked.has(rule.id)).length;
  const total = active.length;
  const byStage = RULE_STAGES.map((stage) => {
    const list = active.filter((rule) => rule.stage === stage);
    const stageDone = list.filter((rule) => checked.has(rule.id)).length;
    return { stage, total: list.length, done: stageDone, pct: list.length ? (stageDone / list.length) * 100 : 0 };
  });
  return { active, done, total, pct: total ? (done / total) * 100 : 0, byStage };
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Consecutive completed days, walking backwards from today. Weekends without
 * any activity are skipped, so a Friday–Monday routine still counts as a
 * streak. Today only extends the streak once it is complete.
 */
export function routineStreak(
  history: Map<string, { checked: number }>,
  total: number,
  today = new Date(),
): number {
  if (total <= 0) return 0;
  const complete = (date: Date) => (history.get(dayKey(date))?.checked ?? 0) >= total;
  let cursor = startOfDay(today);
  if (!complete(cursor)) cursor = addDays(cursor, -1);
  let streak = 0;
  for (let i = 0; i < 370; i++) {
    const day = history.get(dayKey(cursor));
    if (complete(cursor)) {
      streak++;
      cursor = addDays(cursor, -1);
      continue;
    }
    const weekend = cursor.getDay() === 0 || cursor.getDay() === 6;
    if (weekend && !day) {
      cursor = addDays(cursor, -1);
      continue;
    }
    break;
  }
  return streak;
}

/** Longest completed run inside the fetched history window. */
export function routineBestStreak(history: Map<string, { checked: number }>, total: number): number {
  if (total <= 0 || history.size === 0) return 0;
  const keys = [...history.keys()].sort();
  let cursor = parseKey(keys[0]);
  const end = parseKey(keys[keys.length - 1]);
  let best = 0;
  let run = 0;
  while (cursor <= end) {
    const day = history.get(dayKey(cursor));
    if ((day?.checked ?? 0) >= total) {
      run++;
      if (run > best) best = run;
    } else if ((cursor.getDay() === 0 || cursor.getDay() === 6) && !day) {
      // weekends without activity don't break a trading-day streak
    } else {
      run = 0;
    }
    cursor = addDays(cursor, 1);
  }
  return best;
}

export type RoutineConsistency = { pct: number; perfectDays: number; activeDays: number; days: number };

export function routineConsistency(
  history: Map<string, { checked: number }>,
  total: number,
  days = 30,
  end = new Date(),
): RoutineConsistency {
  if (total <= 0) return { pct: 0, perfectDays: 0, activeDays: 0, days };
  let sum = 0;
  let perfectDays = 0;
  let activeDays = 0;
  const last = startOfDay(end);
  for (let i = 0; i < days; i++) {
    const checked = history.get(dayKey(addDays(last, -i)))?.checked ?? 0;
    sum += Math.min(100, (checked / total) * 100);
    if (checked >= total) perfectDays++;
    if (checked > 0) activeDays++;
  }
  return { pct: sum / days, perfectDays, activeDays, days };
}

export type HeatmapDay = {
  key: string;
  date: Date;
  checked: number;
  total: number;
  pct: number;
  hasPlan: boolean;
  hasReview: boolean;
  inFuture: boolean;
};

/** Complete Monday–Sunday weeks ending with the current week. */
export function routineHeatmap(
  history: Map<string, { checked: number; hasPlan: boolean; hasReview: boolean }>,
  total: number,
  weeks = 12,
  end = new Date(),
): HeatmapDay[] {
  const endDay = startOfDay(end);
  const mondayOffset = (endDay.getDay() + 6) % 7;
  const endOfWeek = addDays(endDay, 6 - mondayOffset);
  const start = addDays(endOfWeek, -(weeks * 7 - 1));
  const todayKey = dayKey(endDay);
  return Array.from({ length: weeks * 7 }, (_, index) => {
    const date = addDays(start, index);
    const key = dayKey(date);
    const day = history.get(key);
    const checked = day?.checked ?? 0;
    return {
      key,
      date,
      checked,
      total,
      pct: total > 0 ? Math.min(100, (checked / total) * 100) : 0,
      hasPlan: day?.hasPlan ?? false,
      hasReview: day?.hasReview ?? false,
      inFuture: key > todayKey,
    };
  });
}
