"use server";

import { db } from "@/db";
import {
  STRATEGY_DIRECTIONS,
  STRATEGY_MARKETS,
  STRATEGY_STATUSES,
  playbooks,
  strategies,
} from "@/db/schema";
import type { FormState } from "./actions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

/* --------------------------------- playbooks -------------------------------- */

export async function savePlaybook(id: number, _prev: FormState, fd: FormData): Promise<FormState> {
  const name = String(fd.get("name") ?? "").trim().slice(0, 80);
  const description = String(fd.get("description") ?? "").trim().slice(0, 2000) || null;
  if (!name) return { error: "Give the playbook a name." };

  if (id) {
    await db.update(playbooks).set({ name, description, updatedAt: new Date() }).where(eq(playbooks.id, id));
    revalidatePath("/", "layout");
    redirect("/playbook");
  }
  const [row] = await db.insert(playbooks).values({ name, description }).returning({ id: playbooks.id });
  revalidatePath("/", "layout");
  redirect(`/playbook?playbook=${row.id}`);
}

export async function deletePlaybook(id: number) {
  await db.delete(playbooks).where(eq(playbooks.id, id));
  revalidatePath("/", "layout");
  redirect("/playbook");
}

/* -------------------------------- strategies -------------------------------- */

/** Keeps the typed union while validating a submitted value. */
function pick<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export async function saveStrategy(id: number, _prev: FormState, fd: FormData): Promise<FormState> {
  const text = (key: string, max = 6000) => String(fd.get(key) ?? "").trim().slice(0, max) || null;
  const list = (key: string) => String(fd.get(key) ?? "").replace(/\s*$/, "");

  const name = String(fd.get("name") ?? "").trim().slice(0, 80);
  if (!name) return { error: "Give the strategy a name." };

  const ratingRaw = Number(fd.get("rating"));
  const playbookIdRaw = Number(fd.get("playbookId"));

  const data = {
    playbookId: Number.isFinite(playbookIdRaw) && playbookIdRaw > 0 ? playbookIdRaw : null,
    name,
    market: pick(String(fd.get("market") ?? ""), STRATEGY_MARKETS, "FX"),
    timeframe: text("timeframe", 20),
    session: text("session", 40),
    direction: pick(String(fd.get("direction") ?? ""), STRATEGY_DIRECTIONS, "both"),
    status: pick(String(fd.get("status") ?? ""), STRATEGY_STATUSES, "testing"),
    rating: Number.isFinite(ratingRaw) && ratingRaw >= 1 && ratingRaw <= 5 ? Math.round(ratingRaw) : null,
    risk: text("risk", 120),
    description: text("description"),
    howItWorks: text("howItWorks"),
    entryWhere: text("entryWhere"),
    entryWhy: text("entryWhy"),
    entryCriteria: list("entry_criteria"),
    avoidCriteria: list("avoid_criteria"),
    skipReasons: text("skipReasons"),
    invalidation: text("invalidation"),
    target: text("target"),
    updatedAt: new Date(),
  };

  if (id) {
    await db.update(strategies).set(data).where(eq(strategies.id, id));
    revalidatePath("/", "layout");
    redirect(`/strategies/${id}`);
  }

  const [row] = await db.insert(strategies).values(data).returning({ id: strategies.id });
  revalidatePath("/", "layout");
  redirect(`/strategies/${row.id}`);
}

export async function deleteStrategy(id: number) {
  await db.delete(strategies).where(eq(strategies.id, id));
  revalidatePath("/", "layout");
  redirect("/playbook");
}
