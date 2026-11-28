"use server";

import { db } from "@/db";
import { performanceDigests } from "@/db/schema";
import type { FormState } from "./actions";
import { requireUser } from "@/lib/auth";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

function str(fd: FormData, key: string) {
  const value = fd.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** Stores the trader's own note next to the generated digest. */
export async function saveDigestNote(_prev: FormState, fd: FormData): Promise<FormState> {
  const userId = await requireUser();
  const id = Number(str(fd, "digestId"));
  if (!Number.isInteger(id) || id <= 0) return { error: "That digest could not be found." };

  const note = str(fd, "note").slice(0, 4000) || null;

  const [updated] = await db
    .update(performanceDigests)
    .set({ note, updatedAt: new Date() })
    .where(and(eq(performanceDigests.id, id), eq(performanceDigests.userId, userId)))
    .returning({ id: performanceDigests.id });
  if (!updated) return { error: "That digest could not be found." };

  revalidatePath("/", "layout");
  return { ok: true };
}
