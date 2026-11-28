"use server";

import { db } from "@/db";
import { accounts, tradingGoals } from "@/db/schema";
import type { FormState } from "./actions";
import { requireUser } from "@/lib/auth";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

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

/** Reads one optional positive amount, rejecting anything negative or unreadable. */
function amount(fd: FormData, key: string, label: string): { value: number | null; error?: string } {
  const value = num(fd, key);
  if (value === null) return { value: null };
  if (Number.isNaN(value)) return { value: null, error: `${label} must be a number.` };
  if (value < 0) return { value: null, error: `${label} cannot be negative.` };
  return { value: Math.round(value * 100) / 100 };
}

export async function saveGoals(_prev: FormState, fd: FormData): Promise<FormState> {
  const userId = await requireUser();
  const accountId = Number(str(fd, "accountId"));
  if (!Number.isInteger(accountId) || accountId <= 0) return { error: "Pick an account." };

  const [owned] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
    .limit(1);
  if (!owned) return { error: "Account not found." };

  const profitTarget = amount(fd, "profitTarget", "Profit target");
  if (profitTarget.error) return { error: profitTarget.error };
  const dailyLossLimit = amount(fd, "dailyLossLimit", "Daily loss limit");
  if (dailyLossLimit.error) return { error: dailyLossLimit.error };
  const maxLossLimit = amount(fd, "maxLossLimit", "Total loss limit");
  if (maxLossLimit.error) return { error: maxLossLimit.error };
  const maxRiskPerTrade = amount(fd, "maxRiskPerTrade", "Risk per trade");
  if (maxRiskPerTrade.error) return { error: maxRiskPerTrade.error };

  const riskPct = num(fd, "maxRiskPerTradePct");
  if (riskPct !== null && (Number.isNaN(riskPct) || riskPct < 0 || riskPct > 100))
    return { error: "Risk per trade percentage must be between 0 and 100." };

  const tradesRaw = num(fd, "maxTradesPerDay");
  if (tradesRaw !== null && (Number.isNaN(tradesRaw) || tradesRaw < 0 || tradesRaw > 500))
    return { error: "Trades per day must be between 0 and 500." };
  const openRaw = num(fd, "maxOpenTrades");
  if (openRaw !== null && (Number.isNaN(openRaw) || openRaw < 0 || openRaw > 500))
    return { error: "Open trades must be between 0 and 500." };

  const warnRaw = num(fd, "warnAtPct");
  if (warnRaw !== null && (Number.isNaN(warnRaw) || warnRaw < 10 || warnRaw > 100))
    return { error: "The warning threshold must be between 10 and 100%." };

  const values = {
    profitTarget: profitTarget.value,
    dailyLossLimit: dailyLossLimit.value,
    maxLossLimit: maxLossLimit.value,
    maxRiskPerTrade: maxRiskPerTrade.value,
    maxRiskPerTradePct: riskPct,
    maxTradesPerDay: tradesRaw === null ? null : Math.round(tradesRaw),
    maxOpenTrades: openRaw === null ? null : Math.round(openRaw),
    warnAtPct: warnRaw === null ? 80 : Math.round(warnRaw * 100) / 100,
  };

  await db
    .insert(tradingGoals)
    .values({ userId, accountId, ...values })
    .onConflictDoUpdate({
      target: [tradingGoals.userId, tradingGoals.accountId],
      set: { ...values, updatedAt: new Date() },
    });

  revalidatePath("/", "layout");
  return { ok: true };
}
