"use server";

import { db } from "@/db";
import { SESSION_MARKER_KINDS, accounts, sessionMarkers, type SessionMarkerKind } from "@/db/schema";
import type { FormState } from "./actions";
import { requireUser } from "@/lib/auth";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function str(fd: FormData, key: string) {
  const value = fd.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function validDate(raw: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const [year, month, day] = raw.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/**
 * Combines the trading day with the time picked in the form. The browser
 * sends a bare "HH:mm", which is not a parsable date on its own.
 */
function parseMoment(markerDate: string, raw: string): Date | null {
  if (!raw) {
    const noon = new Date(`${markerDate}T12:00:00`);
    return Number.isNaN(noon.getTime()) ? null : noon;
  }
  const match = /^(\d{1,2}):(\d{2})/.exec(raw);
  if (match) {
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    const pad = (value: number) => String(value).padStart(2, "0");
    const moment = new Date(`${markerDate}T${pad(hours)}:${pad(minutes)}:00`);
    return Number.isNaN(moment.getTime()) ? null : moment;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function addSessionMarker(_prev: FormState, fd: FormData): Promise<FormState> {
  const userId = await requireUser();
  const accountId = Number(str(fd, "accountId"));
  if (!Number.isInteger(accountId) || accountId <= 0) return { error: "Pick an account." };

  const [owned] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
    .limit(1);
  if (!owned) return { error: "Account not found." };

  const markerDate = str(fd, "markerDate");
  if (!validDate(markerDate)) return { error: "Pick a valid date." };

  const note = str(fd, "note").replace(/\s+/g, " ").slice(0, 1000);
  if (!note) return { error: "Write what happened at this moment." };

  const kindRaw = str(fd, "kind") as SessionMarkerKind;
  const kind = SESSION_MARKER_KINDS.includes(kindRaw) ? kindRaw : "note";

  const atRaw = str(fd, "at");
  const at = parseMoment(markerDate, atRaw);
  if (!at) return { error: "That moment in time is not valid." };

  await db.insert(sessionMarkers).values({ userId, accountId, markerDate, at, kind, note });

  revalidatePath("/", "layout");
  redirect(`/day-view?date=${markerDate}&saved=marker`);
}

export async function deleteSessionMarker(id: number) {
  const userId = await requireUser();
  await db
    .delete(sessionMarkers)
    .where(and(eq(sessionMarkers.id, id), eq(sessionMarkers.userId, userId)));
  revalidatePath("/", "layout");
}
