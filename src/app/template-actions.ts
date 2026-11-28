"use server";

import { db } from "@/db";
import { TRADE_DIRECTIONS, tradeTemplates, type TradeDirection } from "@/db/schema";
import type { FormState } from "./actions";
import { requireUser } from "@/lib/auth";
import { normalizeTagNames } from "@/lib/tags";
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

type TemplateInput = {
  name: string;
  symbol: string;
  direction: TradeDirection;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskAmount: number | null;
  size: number | null;
  setup: string | null;
  notes: string | null;
  strategyId: number | null;
  tags: string[];
};

function parseTemplate(fd: FormData, fallbackName: string): { data?: TemplateInput; error?: string } {
  const symbol = str(fd, "symbol").toUpperCase();
  if (!symbol) return { error: "A template needs a symbol." };

  const directionRaw = str(fd, "direction") as TradeDirection;
  const direction = TRADE_DIRECTIONS.includes(directionRaw) ? directionRaw : "long";

  const prices: Record<string, number | null> = {};
  for (const key of ["entryPrice", "stopLoss", "takeProfit", "riskAmount", "size"]) {
    const value = num(fd, key);
    if (value !== null && Number.isNaN(value)) return { error: `${key} must be a number.` };
    prices[key] = value === null ? null : value;
  }
  if (prices.stopLoss !== null && prices.stopLoss <= 0) return { error: "Stop loss must be a positive price." };
  if (prices.takeProfit !== null && prices.takeProfit <= 0) return { error: "Take profit must be a positive price." };
  if (prices.riskAmount !== null && prices.riskAmount < 0) return { error: "Planned risk cannot be negative." };

  const strategyRaw = num(fd, "strategyId");
  const strategyId =
    strategyRaw === null || Number.isNaN(strategyRaw) || strategyRaw <= 0 ? null : Math.round(strategyRaw);

  const name = (str(fd, "name") || fallbackName).replace(/\s+/g, " ").slice(0, 80);
  if (!name) return { error: "Give the template a name." };

  return {
    data: {
      name,
      symbol: symbol.slice(0, 20),
      direction,
      entryPrice: prices.entryPrice,
      stopLoss: prices.stopLoss,
      takeProfit: prices.takeProfit,
      riskAmount: prices.riskAmount,
      size: prices.size,
      setup: str(fd, "setup").slice(0, 120) || null,
      notes: str(fd, "notes").slice(0, 2000) || null,
      strategyId,
      tags: normalizeTagNames(str(fd, "tags")),
    },
  };
}

/** Makes the template name unique by appending a counter. */
async function uniqueName(userId: string, base: string) {
  const [existing] = await db
    .select({ name: tradeTemplates.name })
    .from(tradeTemplates)
    .where(and(eq(tradeTemplates.userId, userId), sql`lower(${tradeTemplates.name}) = lower(${base})`))
    .limit(1);
  if (!existing) return base;
  for (let index = 2; index < 50; index++) {
    const candidate = `${base} ${index}`;
    const [clash] = await db
      .select({ id: tradeTemplates.id })
      .from(tradeTemplates)
      .where(and(eq(tradeTemplates.userId, userId), sql`lower(${tradeTemplates.name}) = lower(${candidate})`))
      .limit(1);
    if (!clash) return candidate;
  }
  return `${base} ${Date.now()}`;
}

export async function createTemplate(_prev: FormState, fd: FormData): Promise<FormState> {
  const userId = await requireUser();
  const parsed = parseTemplate(fd, "New setup");
  if (!parsed.data) return { error: parsed.error };

  const name = await uniqueName(userId, parsed.data.name);
  await db.insert(tradeTemplates).values({ userId, ...parsed.data, name });

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Saves the trade currently on screen as a reusable setup. The button posts
 * the whole trade form, so the template keeps the prices, the risk and the
 * notes the trader just typed.
 */
export async function saveTradeAsTemplate(fd: FormData) {
  const userId = await requireUser();
  const parsed = parseTemplate(fd, "New setup");
  if (!parsed.data) redirect("/trades/new?error=template");

  const base = parsed.data.setup
    ? `${parsed.data.symbol} ${parsed.data.direction} · ${parsed.data.setup}`
    : `${parsed.data.symbol} ${parsed.data.direction}`;
  const name = await uniqueName(userId, base.slice(0, 80));

  const [created] = await db
    .insert(tradeTemplates)
    .values({ userId, ...parsed.data, name })
    .returning({ id: tradeTemplates.id });

  revalidatePath("/", "layout");
  redirect(`/trades/new?saved=template&template=${created.id}`);
}

export async function updateTemplate(id: number, _prev: FormState, fd: FormData): Promise<FormState> {
  const userId = await requireUser();
  const parsed = parseTemplate(fd, "Setup");
  if (!parsed.data) return { error: parsed.error };

  const [owned] = await db
    .select({ id: tradeTemplates.id })
    .from(tradeTemplates)
    .where(and(eq(tradeTemplates.id, id), eq(tradeTemplates.userId, userId)))
    .limit(1);
  if (!owned) return { error: "Template not found." };

  await db
    .update(tradeTemplates)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(tradeTemplates.id, id), eq(tradeTemplates.userId, userId)));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteTemplate(id: number) {
  const userId = await requireUser();
  await db.delete(tradeTemplates).where(and(eq(tradeTemplates.id, id), eq(tradeTemplates.userId, userId)));
  revalidatePath("/", "layout");
}
