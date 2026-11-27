import Link from "next/link";
import { createTrade } from "@/app/actions";
import { TradeForm, type StrategyOption } from "@/components/trade-form";
import { Empty, PageTitle } from "@/components/ui";
import { Icon } from "@/components/icons";
import { db } from "@/db";
import { strategies } from "@/db/schema";
import { getActiveAccount, getDistinctSetups, getDistinctSymbols, getTags } from "@/lib/data";
import { requireUser } from "@/lib/auth";
import { toLocalInput } from "@/lib/format";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const lines = (text: string) => text.split("\n").map((s) => s.trim()).filter(Boolean);

export default async function NewTradePage() {
  const userId = await requireUser();
  const { account } = await getActiveAccount();
  if (!account) return <Empty title="Start with an account" body="Give your trades a home before logging the first one." action={{ href: "/accounts?new=1", label: "Add account" }} />;
  const [setups, symbols, strategyRows, allTags] = await Promise.all([
    getDistinctSetups(account.id),
    getDistinctSymbols(account.id),
    db.select({ id: strategies.id, name: strategies.name, criteria: strategies.entryCriteria })
      .from(strategies).where(eq(strategies.userId, userId)).orderBy(strategies.name),
    getTags(),
  ]);
  const strategyOptions: StrategyOption[] = strategyRows.map((s) => ({ id: s.id, name: s.name, criteria: lines(s.criteria) }));
  const now = new Date();now.setSeconds(0,0);
  return <div className="mx-auto max-w-[850px]"><Link href="/trades" className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted hover:text-brand"><Icon name="arrow" size={13} className="rotate-180"/>Back to trade log</Link><PageTitle title="Log a trade" subtitle={`Capture the trade. Remember the thinking. · ${account.name}`}/><TradeForm action={createTrade} accountId={account.id} setups={setups} symbols={symbols} strategies={strategyOptions} allTags={allTags} cancelHref="/trades" submitLabel="Save trade" defaultTime={toLocalInput(now)}/></div>;
}
