import { cache } from "react";
import { redirect } from "next/navigation";
import { isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, journalEntries, playbooks, strategies, trades } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

/** The signed-in Supabase user (verified against Auth), or null. Deduped per render. */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** Signed-in user id, or redirect to the login page. Use at the top of every gated page/action. */
export async function requireUser(): Promise<string> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user.id;
}

/**
 * The very first account to sign in claims every migrated row that still has
 * no owner, so the original journal (accounts, trades, playbook, strategies,
 * journal entries) lands on that account. Once any row is owned this is a
 * no-op, so later signups always start with an empty workspace.
 *
 * Runs inside a transaction with an advisory lock so two simultaneous first
 * signups can't split the legacy rows between them.
 */
export async function claimLegacyData(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(727375)`);

    const result = await tx.execute<{ owned: boolean }>(sql`
      select coalesce(
        (select bool_or(user_id is not null) from accounts) or
        (select bool_or(user_id is not null) from trades) or
        (select bool_or(user_id is not null) from playbooks) or
        (select bool_or(user_id is not null) from strategies) or
        (select bool_or(user_id is not null) from journal_entries),
        false) as owned
    `);
    if (result.rows[0]?.owned) return;

    await tx.update(accounts).set({ userId }).where(isNull(accounts.userId));
    await tx.update(trades).set({ userId }).where(isNull(trades.userId));
    await tx.update(playbooks).set({ userId }).where(isNull(playbooks.userId));
    await tx.update(strategies).set({ userId }).where(isNull(strategies.userId));
    await tx.update(journalEntries).set({ userId }).where(isNull(journalEntries.userId));
  });
}
