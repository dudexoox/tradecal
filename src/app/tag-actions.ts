"use server";

import { db } from "@/db";
import { tags } from "@/db/schema";
import type { FormState } from "./actions";
import { requireUser } from "@/lib/auth";
import { TAG_COLORS } from "@/lib/tags";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function createTag(_prev: FormState, fd: FormData): Promise<FormState> {
  const userId = await requireUser();
  const name = String(fd.get("name") ?? "").trim().replace(/\s+/g, " ").slice(0, 30);
  if (!name) return { error: "Give the tag a name." };

  const [duplicate] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.userId, userId), sql`lower(${tags.name}) = lower(${name})`))
    .limit(1);
  if (duplicate) return { error: `You already have a tag called “${name}”.` };

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tags)
    .where(eq(tags.userId, userId));
  const color = TAG_COLORS[(countRow?.count ?? 0) % TAG_COLORS.length];

  await db.insert(tags).values({ userId, name, color }).onConflictDoNothing();
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteTag(id: number) {
  const userId = await requireUser();
  await db.delete(tags).where(and(eq(tags.id, id), eq(tags.userId, userId)));
  revalidatePath("/", "layout");
}
