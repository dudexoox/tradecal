import { db } from "@/db";
import { tags, tradeTags } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

/** Chip colours assigned in order as tags are created. */
export const TAG_COLORS = [
  "#0781fe",
  "#199b78",
  "#e16a76",
  "#b07c1f",
  "#7c5cff",
  "#2699b9",
  "#c2410c",
  "#64748b",
] as const;

/** Trim, de-duplicate case-insensitively, and cap the number of tags per trade. */
export function normalizeTagNames(raw: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[,\n]/)) {
    const name = part.trim().replace(/\s+/g, " ").slice(0, 30);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= 12) break;
  }
  return out;
}

/**
 * Replace a trade's tags with the supplied names, creating any tags that do
 * not exist yet. Every row written is scoped to the owning user.
 */
export async function syncTradeTags(userId: string, tradeId: number, names: string[]): Promise<void> {
  const wanted = normalizeTagNames(names.join(","));
  const existing = await db.select({ id: tags.id, name: tags.name }).from(tags).where(eq(tags.userId, userId));
  const byName = new Map(existing.map((tag) => [tag.name.toLowerCase(), tag.id]));
  let colourIndex = existing.length;

  for (const name of wanted) {
    if (byName.has(name.toLowerCase())) continue;
    const [row] = await db
      .insert(tags)
      .values({ userId, name, color: TAG_COLORS[colourIndex % TAG_COLORS.length] })
      .onConflictDoUpdate({ target: [tags.userId, tags.name], set: { name } })
      .returning({ id: tags.id });
    if (row) byName.set(name.toLowerCase(), row.id);
    colourIndex++;
  }

  const wantedIds = new Set(
    wanted
      .map((name) => byName.get(name.toLowerCase()))
      .filter((id): id is number => typeof id === "number"),
  );

  const links = await db
    .select({ tagId: tradeTags.tagId })
    .from(tradeTags)
    .where(and(eq(tradeTags.userId, userId), eq(tradeTags.tradeId, tradeId)));
  const remove = links.map((link) => link.tagId).filter((tagId) => !wantedIds.has(tagId));
  if (remove.length > 0) {
    await db
      .delete(tradeTags)
      .where(
        and(
          eq(tradeTags.userId, userId),
          eq(tradeTags.tradeId, tradeId),
          inArray(tradeTags.tagId, remove),
        ),
      );
  }

  if (wantedIds.size > 0) {
    await db
      .insert(tradeTags)
      .values([...wantedIds].map((tagId) => ({ tradeId, tagId, userId })))
      .onConflictDoNothing();
  }
}
