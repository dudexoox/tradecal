import Link from "next/link";
import { createTrade } from "@/app/actions";
import { TradeForm, type StrategyOption, type TradeDefaults } from "@/components/trade-form";
import { Empty, PageTitle } from "@/components/ui";
import { Icon } from "@/components/icons";
import { db } from "@/db";
import { strategies } from "@/db/schema";
import { getActiveAccount, getDistinctSetups, getDistinctSymbols, getGoals, getTags, getTrades, getTradeTemplates } from "@/lib/data";
import { requireUser } from "@/lib/auth";
import { toLocalInput } from "@/lib/format";
import { computeGoalStatus, resolveGoals } from "@/lib/goals";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const lines = (text: string) => text.split("\n").map((s) => s.trim()).filter(Boolean);

export default async function NewTradePage({ searchParams }: { searchParams: Promise<{ template?: string; saved?: string }> }) {
  const sp = await searchParams;
  const userId = await requireUser();
  const { account } = await getActiveAccount();
  if (!account) return <Empty title="Start with an account" body="Give your trades a home before logging the first one." action={{ href: "/accounts?new=1", label: "Add account" }} />;
  const [setups, symbols, strategyRows, allTags, templates, goalRow, accountTrades] = await Promise.all([
    getDistinctSetups(account.id),
    getDistinctSymbols(account.id),
    db.select({ id: strategies.id, name: strategies.name, criteria: strategies.entryCriteria })
      .from(strategies).where(eq(strategies.userId, userId)).orderBy(strategies.name),
    getTags(),
    getTradeTemplates(),
    getGoals(account.id),
    getTrades(account.id),
  ]);
  const strategyOptions: StrategyOption[] = strategyRows.map((s) => ({ id: s.id, name: s.name, criteria: lines(s.criteria) }));
  const now = new Date();now.setSeconds(0,0);

  const goals = resolveGoals(account, goalRow);
  const statuses = computeGoalStatus(account, goals, accountTrades);
  const daily = statuses.find((status) => status.key === "dailyLoss");
  const guardrails = {
    dailyLossLimit: goals.dailyLossLimit,
    dailyLossUsed: daily?.used ?? 0,
    dailyLossState: daily?.state === "breach" ? ("breach" as const) : daily?.state === "warn" ? ("warn" as const) : ("ok" as const),
    maxRiskPerTrade: goals.maxRiskPerTrade,
  };

  const templateId = Number(sp.template);
  const template = templates.find((item) => item.id === templateId) ?? null;
  const defaults: TradeDefaults | undefined = template
    ? {
        symbol: template.symbol,
        direction: template.direction,
        entryPrice: template.entryPrice,
        stopLoss: template.stopLoss,
        takeProfit: template.takeProfit,
        riskAmount: template.riskAmount,
        size: template.size,
        setup: template.setup,
        notes: template.notes,
        strategyId: template.strategyId,
        tags: template.tags,
      }
    : undefined;

  return <div className="mx-auto max-w-[850px]">
    <Link href="/trades" className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted hover:text-brand"><Icon name="arrow" size={13} className="rotate-180"/>Back to trade log</Link>
    <PageTitle title="Log a trade" subtitle={`Capture the trade. Remember the thinking. · ${account.name}`}/>

    {sp.saved === "template" && (
      <p role="status" className="mb-4 flex items-center gap-2 rounded-lg bg-up/7 px-4 py-3 text-xs text-up"><Icon name="checkCircle" size={15}/>Saved as a template. It is ready on the Templates page.</p>
    )}

    {templates.length > 0 && (
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel px-4 py-3">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted"><Icon name="sparkles" size={13} className="text-brand"/>Start from a template</span>
        {templates.map((item) => (
          <Link
            key={item.id}
            href={`/trades/new?template=${item.id}`}
            aria-current={template?.id === item.id ? "true" : undefined}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-medium transition-colors ${
              template?.id === item.id ? "border-brand/30 bg-brand/7 text-brand" : "border-line-2 bg-white text-muted hover:border-brand/40 hover:text-fg"
            }`}
          >
            <span className="num">{item.symbol}</span>
            <span className="capitalize">{item.direction}</span>
            {item.setup && <span className="hidden text-dim sm:inline">· {item.setup}</span>}
          </Link>
        ))}
        <Link href="/templates" className="ml-auto text-link text-[11px]">Manage<Icon name="arrow" size={11}/></Link>
      </div>
    )}

    <TradeForm action={createTrade} accountId={account.id} setups={setups} symbols={symbols} strategies={strategyOptions} allTags={allTags} cancelHref="/trades" submitLabel="Save trade" defaultTime={toLocalInput(now)} defaults={defaults} guardrails={guardrails}/>
  </div>;
}
