import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteStrategy } from "@/app/playbook-actions";
import { DeleteButton } from "@/components/delete-button";
import { CriteriaChecklist } from "@/components/criteria-checklist";
import { TradesTable } from "@/components/trades-table";
import { PageTitle, Pnl } from "@/components/ui";
import { Icon } from "@/components/icons";
import { db } from "@/db";
import { playbooks, strategies, trades, type StrategyStatus } from "@/db/schema";
import { getActiveAccount } from "@/lib/data";
import { requireUser } from "@/lib/auth";
import { fmtDate, fmtMoney, fmtPct, fmtSignedMoney } from "@/lib/format";
import { and, asc, desc, eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const TONE: Record<StrategyStatus, string> = {
  active: "border-up/25 bg-up/7 text-up",
  testing: "border-brand/25 bg-brand/7 text-brand",
  archived: "border-line bg-panel-2 text-muted",
};
const LABEL: Record<StrategyStatus, string> = { active: "Active", testing: "In testing", archived: "Archived" };

const lines = (text: string | null) => (text ?? "").split("\n").map((s) => s.trim()).filter(Boolean);

function Block({ title, body }: { title: string; body: string | null }) {
  return (
    <div className="border-t border-line pt-4 first:border-0 first:pt-0">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{title}</h3>
      {body ? (
        <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-fg/90">{body}</p>
      ) : (
        <p className="mt-2 text-xs text-dim">Not written down yet — fill this in before trading it from memory.</p>
      )}
    </div>
  );
}

export default async function StrategyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isInteger(id)) notFound();
  const userId = await requireUser();

  const [strategy] = await db
    .select()
    .from(strategies)
    .where(and(eq(strategies.id, id), eq(strategies.userId, userId)))
    .limit(1);
  if (!strategy) notFound();

  const [playbook] = strategy.playbookId
    ? await db
        .select()
        .from(playbooks)
        .where(and(eq(playbooks.id, strategy.playbookId), eq(playbooks.userId, userId)))
        .limit(1)
    : [];
  const linked = await db
    .select()
    .from(trades)
    .where(and(eq(trades.strategyId, id), eq(trades.userId, userId)))
    .orderBy(desc(sql`coalesce(${trades.closedAt}, ${trades.openedAt})`), desc(trades.id));
  const { account } = await getActiveAccount();
  const currency = account?.currency ?? "USD";

  const net = linked.reduce((sum, t) => sum + t.pnl, 0);
  const wins = linked.filter((t) => t.pnl > 0).length;
  const winRate = linked.length ? (wins / linked.length) * 100 : 0;

  const entry = lines(strategy.entryCriteria);
  const avoid = lines(strategy.avoidCriteria);

  const meta: { label: string; value: string }[] = [
    { label: "Status", value: LABEL[strategy.status] },
    { label: "Market", value: strategy.market },
    { label: "Timeframe", value: strategy.timeframe ?? "Any" },
    { label: "Session", value: strategy.session ?? "Any" },
    { label: "Applies to", value: strategy.direction === "both" ? "Long & short" : strategy.direction },
    { label: "Risk plan", value: strategy.risk ?? "—" },
    { label: "Confidence", value: strategy.rating ? `${strategy.rating} / 5` : "Not rated" },
    { label: "Written", value: fmtDate(strategy.createdAt) },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href="/playbook" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-brand">
          <Icon name="arrow" size={13} className="rotate-180" />Playbook
        </Link>
        <div className="flex items-center gap-2">
          <DeleteButton
            action={deleteStrategy.bind(null, strategy.id)}
            confirmText={`Delete "${strategy.name}"? Its trades stay in your journal, unlinked.`}
          />
          <Link href={`/playbook?editStrategy=${strategy.id}`} className="btn-ghost h-9 text-xs">
            <Icon name="pen" size={14} />Edit strategy
          </Link>
        </div>
      </div>

      <PageTitle
        title={
          <span className="flex flex-wrap items-center gap-3">
            {strategy.name}
            <span className={`inline-flex h-6 items-center rounded-md border px-2 text-[10px] font-medium ${TONE[strategy.status]}`}>
              {LABEL[strategy.status]}
            </span>
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-2 text-muted">
            <span>{strategy.market} · {strategy.timeframe ?? "Any"} · {strategy.session ?? "Any"}</span>
            <span className="text-line-2">·</span>
            <span className="capitalize">{strategy.direction === "both" ? "long & short" : strategy.direction} only</span>
            {playbook && (
              <>
                <span className="text-line-2">·</span>
                <Link href="/playbook" className="inline-flex items-center gap-1.5 text-brand-2 hover:underline">
                  <Icon name="book" size={13} />{playbook.name}
                </Link>
              </>
            )}
          </span>
        }
      />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_270px]">
        <div className="space-y-5">
          <section className="card p-6">
            <h2 className="mb-4 text-sm font-semibold">The idea</h2>
            <div className="space-y-4">
              <Block title="What the strategy is" body={strategy.description} />
              <Block title="How it has worked in practice" body={strategy.howItWorks} />
            </div>
          </section>

          <section className="card p-6">
            <h2 className="mb-4 text-sm font-semibold">Where — and why — it enters</h2>
            <div className="space-y-4">
              <Block title="Where you enter" body={strategy.entryWhere} />
              <Block title="The reason for the trade" body={strategy.entryWhy} />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Checklists</h2>
            <CriteriaChecklist items={entry} label="Entry checklist — all of these must be true" />
            <CriteriaChecklist items={avoid} label="Skip list — pass on the trade if any of these show" tone="down" />
          </section>

          <section className="card p-6">
            <h2 className="mb-4 text-sm font-semibold">Criteria it deliberately ignores</h2>
            <Block title="What you drop, and why" body={strategy.skipReasons} />
          </section>

          <section className="card p-6">
            <h2 className="mb-4 text-sm font-semibold">Invalidation &amp; exit</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Block title="What proves it wrong" body={strategy.invalidation} />
              <Block title="Target plan" body={strategy.target} />
            </div>
          </section>

          <section>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Trades taken with this strategy</h2>
                <p className="mt-1 text-[11px] text-muted">
                  {linked.length ? `${linked.length} linked · ${fmtPct(winRate, 0)} win rate` : "Select this strategy when you log a trade and it appears here."}
                </p>
              </div>
              {linked.length > 0 && (
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-dim">Net</div>
                  <div className={`num text-lg font-semibold ${net >= 0 ? "text-up" : "text-down"}`}>{fmtSignedMoney(net, currency, 0)}</div>
                </div>
              )}
            </div>
            {linked.length > 0 ? (
              <TradesTable trades={linked} currency={currency} />
            ) : (
              <div className="rounded-xl border border-dashed border-line-2 px-5 py-10 text-center">
                <p className="text-sm text-muted">No trades linked yet.</p>
                <Link href="/trades/new" className="btn-primary mt-5">
                  <Icon name="plus" size={15} />Log a trade with this strategy
                </Link>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          <section className="card p-5">
            <h2 className="mb-4 text-[13px] font-semibold">At a glance</h2>
            <dl className="divide-y divide-line">
              {meta.map((m) => (
                <div key={m.label} className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="text-[11px] text-muted">{m.label}</dt>
                  <dd className="text-xs font-medium capitalize">{m.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-xl border border-[#deebfc] bg-[#f3f8ff] p-5">
            <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-white text-brand shadow-[0_2px_4px_#0781fe08]">
              <Icon name="flag" size={17} />
            </span>
            <p className="text-[13px] font-semibold">Trade the book, not the mood.</p>
            <p className="mt-2 text-xs leading-relaxed text-[#7891ac]">
              When you take this setup, pick it in the trade form so the record stays honest.
            </p>
            <Link href="/trades/new" className="mt-4 flex h-9 items-center justify-center gap-2 rounded-lg border border-brand/15 bg-white text-xs font-medium text-brand transition-colors hover:bg-brand hover:text-white">
              <Icon name="plus" size={14} />Log a trade
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
