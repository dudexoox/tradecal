"use server";

import { db } from "@/db";
import {
  RULE_STAGES,
  dailyPlans,
  dailyRuleChecks,
  tradingRules,
  type RuleStage,
} from "@/db/schema";
import type { FormState } from "./actions";
import { requireUser } from "@/lib/auth";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function str(fd: FormData, key: string) {
  const value = fd.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function num(fd: FormData, key: string): number | null {
  const raw = str(fd, key).replace(/,/g, "");
  if (raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : NaN;
}

function validDate(raw: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const [year, month, day] = raw.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/* ---------------------------------- plan ---------------------------------- */

export async function saveDailyPlan(_prev: FormState, fd: FormData): Promise<FormState> {
  const userId = await requireUser();
  const planDate = str(fd, "planDate");
  if (!validDate(planDate)) return { error: "Pick a valid date." };

  const maxTradesRaw = num(fd, "maxTrades");
  if (maxTradesRaw !== null && (Number.isNaN(maxTradesRaw) || maxTradesRaw < 0 || maxTradesRaw > 100))
    return { error: "Max trades must be between 0 and 100." };
  const maxRiskRaw = num(fd, "maxRiskPct");
  if (maxRiskRaw !== null && (Number.isNaN(maxRiskRaw) || maxRiskRaw < 0 || maxRiskRaw > 100))
    return { error: "Max risk must be a percentage between 0 and 100." };

  const intention = str(fd, "intention").slice(0, 2000) || null;
  const marketBias = str(fd, "marketBias").slice(0, 4000) || null;
  const watchlist = str(fd, "watchlist").slice(0, 1000) || null;
  const maxTrades = maxTradesRaw === null ? null : Math.round(maxTradesRaw);
  const maxRiskPct = maxRiskRaw;

  await db
    .insert(dailyPlans)
    .values({ userId, planDate, intention, marketBias, watchlist, maxTrades, maxRiskPct })
    .onConflictDoUpdate({
      target: [dailyPlans.userId, dailyPlans.planDate],
      set: { intention, marketBias, watchlist, maxTrades, maxRiskPct, updatedAt: new Date() },
    });

  revalidatePath("/", "layout");
  redirect(`/routine?date=${planDate}&saved=plan#plan`);
}

/* --------------------------------- review --------------------------------- */

export async function saveDailyReview(_prev: FormState, fd: FormData): Promise<FormState> {
  const userId = await requireUser();
  const planDate = str(fd, "planDate");
  if (!validDate(planDate)) return { error: "Pick a valid date." };

  const review = str(fd, "review").slice(0, 6000) || null;
  const ratingRaw = num(fd, "rating");
  const rating =
    ratingRaw === null || Number.isNaN(ratingRaw) ? null : Math.min(5, Math.max(1, Math.round(ratingRaw)));
  const followedRaw = str(fd, "followedPlan");
  const followedPlan = followedRaw === "yes" ? true : followedRaw === "no" ? false : null;

  await db
    .insert(dailyPlans)
    .values({ userId, planDate, review, rating, followedPlan })
    .onConflictDoUpdate({
      target: [dailyPlans.userId, dailyPlans.planDate],
      set: { review, rating, followedPlan, updatedAt: new Date() },
    });

  revalidatePath("/", "layout");
  redirect(`/routine?date=${planDate}&saved=review#review`);
}

/* ------------------------------ rule checklist ----------------------------- */

export async function toggleDailyRule(
  ruleId: number,
  planDate: string,
  checked: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await requireUser();
  if (!validDate(planDate)) return { ok: false, error: "Pick a valid date." };

  const [rule] = await db
    .select({ id: tradingRules.id })
    .from(tradingRules)
    .where(and(eq(tradingRules.id, ruleId), eq(tradingRules.userId, userId)))
    .limit(1);
  if (!rule) return { ok: false, error: "Rule not found." };

  if (checked) {
    await db
      .insert(dailyRuleChecks)
      .values({ userId, planDate, ruleId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(dailyRuleChecks)
      .where(
        and(
          eq(dailyRuleChecks.userId, userId),
          eq(dailyRuleChecks.planDate, planDate),
          eq(dailyRuleChecks.ruleId, ruleId),
        ),
      );
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

/* -------------------------------- rule setup ------------------------------- */

export async function saveTradingRule(_prev: FormState, fd: FormData): Promise<FormState> {
  const userId = await requireUser();
  const planDate = str(fd, "planDate");
  const stage = str(fd, "stage") as RuleStage;
  if (!RULE_STAGES.includes(stage)) return { error: "Choose a stage." };
  const title = str(fd, "title").replace(/\s+/g, " ").slice(0, 120);
  if (!title) return { error: "Give the rule a title." };
  const description = str(fd, "description").slice(0, 500) || null;

  const [duplicate] = await db
    .select({ id: tradingRules.id })
    .from(tradingRules)
    .where(and(eq(tradingRules.userId, userId), sql`lower(${tradingRules.title}) = lower(${title})`))
    .limit(1);
  if (duplicate) return { error: `You already have a rule called “${title}”.` };

  const [maxRow] = await db
    .select({ max: sql<number>`coalesce(max(${tradingRules.sortOrder}), 0)::int` })
    .from(tradingRules)
    .where(and(eq(tradingRules.userId, userId), eq(tradingRules.stage, stage)));

  await db.insert(tradingRules).values({
    userId,
    stage,
    title,
    description,
    sortOrder: (maxRow?.max ?? 0) + 1,
  });

  revalidatePath("/", "layout");
  redirect(`/routine${validDate(planDate) ? `?date=${planDate}&rules=1` : "?rules=1"}#rules`);
}

export async function toggleTradingRule(id: number) {
  const userId = await requireUser();
  const [rule] = await db
    .select({ active: tradingRules.active })
    .from(tradingRules)
    .where(and(eq(tradingRules.id, id), eq(tradingRules.userId, userId)))
    .limit(1);
  if (!rule) return;
  await db
    .update(tradingRules)
    .set({ active: !rule.active })
    .where(and(eq(tradingRules.id, id), eq(tradingRules.userId, userId)));
  revalidatePath("/", "layout");
}

export async function deleteTradingRule(id: number) {
  const userId = await requireUser();
  await db.delete(tradingRules).where(and(eq(tradingRules.id, id), eq(tradingRules.userId, userId)));
  revalidatePath("/", "layout");
}
