"use server";

import { db } from "@/db";
import { accounts, tradeViews } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { normaliseColumns, normaliseFilters } from "@/lib/views";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function str(fd: FormData, key: string) {
  const value = fd.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseJson<T>(raw: string, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Creates a saved view from the filters and columns currently in use. */
export async function createView(fd: FormData) {
  const userId = await requireUser();
  const accountId = Number(str(fd, "accountId"));
  if (!Number.isInteger(accountId) || accountId <= 0) redirect("/trades?viewError=account");

  const [owned] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
    .limit(1);
  if (!owned) redirect("/trades?viewError=account");

  const name = str(fd, "name").replace(/\s+/g, " ").slice(0, 60);
  if (!name) redirect("/trades?viewError=name");

  const filters = normaliseFilters(parseJson<Record<string, string>>(str(fd, "filters"), {}));
  const columns = normaliseColumns(parseJson<string[]>(str(fd, "columns"), []));
  const pinned = str(fd, "pinned") === "on";

  const [duplicate] = await db
    .select({ id: tradeViews.id })
    .from(tradeViews)
    .where(
      and(
        eq(tradeViews.userId, userId),
        eq(tradeViews.accountId, accountId),
        sql`lower(${tradeViews.name}) = lower(${name})`,
      ),
    )
    .limit(1);
  if (duplicate) redirect(`/trades?viewError=duplicate&view=${duplicate.id}`);

  const [created] = await db
    .insert(tradeViews)
    .values({ userId, accountId, name, filters, columns, pinned })
    .returning({ id: tradeViews.id });

  revalidatePath("/", "layout");
  redirect(`/trades?view=${created.id}`);
}

/** Replaces the columns and filters of a saved view. */
export async function updateView(id: number, fd: FormData) {
  const userId = await requireUser();
  const filters = normaliseFilters(parseJson<Record<string, string>>(str(fd, "filters"), {}));
  const columns = normaliseColumns(parseJson<string[]>(str(fd, "columns"), []));

  await db
    .update(tradeViews)
    .set({ filters, columns, updatedAt: new Date() })
    .where(and(eq(tradeViews.id, id), eq(tradeViews.userId, userId)));
  revalidatePath("/", "layout");
}

export async function toggleViewPin(id: number) {
  const userId = await requireUser();
  const [view] = await db
    .select({ pinned: tradeViews.pinned })
    .from(tradeViews)
    .where(and(eq(tradeViews.id, id), eq(tradeViews.userId, userId)))
    .limit(1);
  if (!view) return;
  await db
    .update(tradeViews)
    .set({ pinned: !view.pinned, updatedAt: new Date() })
    .where(and(eq(tradeViews.id, id), eq(tradeViews.userId, userId)));
  revalidatePath("/", "layout");
}

export async function deleteView(id: number) {
  const userId = await requireUser();
  await db.delete(tradeViews).where(and(eq(tradeViews.id, id), eq(tradeViews.userId, userId)));
  revalidatePath("/", "layout");
  redirect("/trades");
}
