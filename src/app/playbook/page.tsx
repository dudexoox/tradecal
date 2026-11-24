import Link from "next/link";
import { deletePlaybook, deleteStrategy, savePlaybook, saveStrategy } from "@/app/playbook-actions";
import { DeleteButton } from "@/components/delete-button";
import { PlaybookForm } from "@/components/playbook-form";
import { StrategyForm } from "@/components/strategy-form";
import { Empty, PageTitle } from "@/components/ui";
import { Icon } from "@/components/icons";
import { db } from "@/db";
import { playbooks, strategies, trades, type StrategyStatus } from "@/db/schema";
import { ensureSeeded } from "@/lib/seed";
import { fmtMoney, fmtPct } from "@/lib/format";
import { asc, inArray, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<StrategyStatus, string> = {
  active: "border-up/25 bg-up/7 text-up",
  testing: "border-brand/25 bg-brand/7 text-brand",
  archived: "border-line bg-panel-2 text-muted",
};
const STATUS_LABEL: Record<StrategyStatus, string> = { active: "Active", testing: "In testing", archived: "Archived" };

type Search = { new?: string; playbook?: string; editStrategy?: string; editPlaybook?: string };

export default async function PlaybookPage({ searchParams }: { searchParams: Promise<Search> }) {
  await ensureSeeded();
  const sp = await searchParams;

  const [allPlaybooks, allStrategies] = await Promise.all([
    db.select().from(playbooks).orderBy(asc(playbooks.createdAt), asc(playbooks.id)),
    db.select().from(strategies).orderBy(asc(strategies.createdAt), asc(strategies.id)),
  ]);

  const ids = allStrategies.map((s) => s.id);
  const agg =
    ids.length === 0
      ? []
      : await db
          .select({
            strategyId: trades.strategyId,
            count: sql<number>`count(*)::int`,
            net: sql<number>`coalesce(sum(${trades.pnl}), 0)::float8`,
            wins: sql<number>`count(*) filter (where ${trades.pnl} > 0)::int`,
          })
          .from(trades)
          .where(inArray(trades.strategyId, ids))
          .groupBy(trades.strategyId);
  const byStrategy = new Map(agg.map((a) => [a.strategyId, a]));

  const editingStrategy = sp.editStrategy
    ? allStrategies.find((s) => s.id === Number(sp.editStrategy))
    : undefined;
  const editingPlaybook = sp.editPlaybook
    ? allPlaybooks.find((p) => p.id === Number(sp.editPlaybook))
    : undefined;

  /* -------------------------------------------------------- strategy form */
  if (sp.new === "strategy" || editingStrategy) {
    return (
      <div className="mx-auto max-w-[850px]">
        <Link href="/playbook" className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted hover:text-brand">
          <Icon name="arrow" size={13} className="rotate-180" />
          {editingStrategy ? "Back to playbook" : "Cancel and go back"}
        </Link>
        <PageTitle
          title={editingStrategy ? editingStrategy.name : "New strategy"}
          subtitle={
            editingStrategy
              ? "Update the rules your future trades will be judged against."
              : "Describe it fully enough that future-you could trade it without you standing there."
          }
        />
        <StrategyForm
          key={editingStrategy?.id ?? "new-strategy"}
          action={editingStrategy ? saveStrategy.bind(null, editingStrategy.id) : saveStrategy.bind(null, 0)}
          strategy={editingStrategy}
          playbooks={allPlaybooks}
          cancelHref="/playbook"
        />
      </div>
    );
  }

  /* -------------------------------------------------------- playbook form */
  if (sp.new === "playbook" || editingPlaybook) {
    return (
      <div className="mx-auto max-w-[700px]">
        <Link href="/playbook" className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted hover:text-brand">
          <Icon name="arrow" size={13} className="rotate-180" />Cancel and go back
        </Link>
        <PageTitle
          title={editingPlaybook ? editingPlaybook.name : "New playbook"}
          subtitle="A playbook is a book of plays — group the strategies you actually trade by session, market or idea."
        />
        <PlaybookForm
          key={editingPlaybook?.id ?? "new-playbook"}
          action={editingPlaybook ? savePlaybook.bind(null, editingPlaybook.id) : savePlaybook.bind(null, 0)}
          playbook={editingPlaybook}
          cancelHref="/playbook"
        />
      </div>
    );
  }

  /* ------------------------------------------------------------ list view */
  return (
    <>
      <PageTitle
        title="Playbook"
        subtitle="Your strategies, written down: what must be true, what voids the trade, and why it enters."
        action={
          <div className="flex gap-2">
            <Link href="/playbook?new=playbook" className="btn-ghost">
              <Icon name="book" size={15} />New playbook
            </Link>
            <Link href="/playbook?new=strategy" className="btn-primary">
              <Icon name="flag" size={15} />New strategy
            </Link>
          </div>
        }
      />

      <section>
        <h2 className="mb-4 text-[13px] font-semibold">
          Playbooks<span className="ml-2 text-[11px] font-normal text-muted">{allPlaybooks.length}</span>
        </h2>
        {allPlaybooks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-2 px-5 py-8 text-center text-sm text-muted">
            No playbooks yet — create one to group your strategies.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {allPlaybooks.map((p) => {
              const mine = allStrategies.filter((s) => s.playbookId === p.id);
              const active = mine.filter((s) => s.status === "active").length;
              return (
                <article key={p.id} className="card flex flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/7 text-brand">
                      <Icon name="book" size={18} />
                    </span>
                    <div className="flex gap-1">
                      <Link href={`/playbook?editPlaybook=${p.id}`} className="icon-button h-7 w-7" aria-label={`Edit ${p.name}`}>
                        <Icon name="pen" size={13} />
                      </Link>
                      <DeleteButton
                        action={deletePlaybook.bind(null, p.id)}
                        confirmText={`Delete "${p.name}"? Its strategies will stay, unfiled.`}
                        className="icon-button h-7 w-7 hover:text-down"
                      />
                    </div>
                  </div>
                  <h3 className="mt-4 text-[15px] font-semibold tracking-[-0.3px]">{p.name}</h3>
                  {p.description && <p className="mt-2 flex-1 text-xs leading-relaxed text-muted">{p.description}</p>}
                  <p className="mt-4 border-t border-line pt-3 text-[11px] text-muted">
                    {mine.length} {mine.length === 1 ? "strategy" : "strategies"}
                    {active > 0 && <span className="text-up"> · {active} active</span>}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-[13px] font-semibold">
          Strategies<span className="ml-2 text-[11px] font-normal text-muted">{allStrategies.length}</span>
        </h2>
        {allStrategies.length === 0 ? (
          <Empty
            title="Your first strategy starts here"
            body="Write down where it enters, why it enters, what must be true first — and what you deliberately skip. Then pick it when you log a trade."
            action={{ href: "/playbook?new=strategy", label: "Create a strategy" }}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {allStrategies.map((s) => {
              const stats = byStrategy.get(s.id);
              const entryList = s.entryCriteria.split("\n").filter(Boolean);
              const skipList = s.avoidCriteria.split("\n").filter(Boolean);
              const playbook = allPlaybooks.find((p) => p.id === s.playbookId);
              return (
                <Link key={s.id} href={`/strategies/${s.id}`} className="group card flex flex-col p-5 transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[0_6px_20px_#1c41630a]">
                  <div className="flex items-start justify-between gap-3">
                    <span className={`inline-flex h-5 items-center rounded-md border px-1.5 text-[10px] font-medium ${STATUS_TONE[s.status]}`}>
                      {STATUS_LABEL[s.status]}
                    </span>
                    <span className="text-[10px] text-muted">{s.market} · {s.timeframe ?? "—"} · {s.session ?? "Any"}</span>
                  </div>
                  <h3 className="mt-3 text-[15px] font-semibold tracking-[-0.3px] group-hover:text-brand">{s.name}</h3>
                  {s.description && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">{s.description}</p>}
                  <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-3 text-[10px] text-muted">
                    <span className="inline-flex items-center gap-1"><Icon name="checkCircle" size={11} className="text-up" />{entryList.length} checks</span>
                    <span className="inline-flex items-center gap-1"><Icon name="flag" size={11} className="text-down" />{skipList.length} skip rules</span>
                    {playbook && <span className="inline-flex items-center gap-1"><Icon name="book" size={11} />{playbook.name}</span>}
                  </div>
                  <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
                    <span className="text-[10px] text-muted">{stats ? `${stats.count} trades` : "Not traded yet"}</span>
                    {stats && (
                      <span className={`num text-xs font-semibold ${stats.net >= 0 ? "text-up" : "text-down"}`}>
                        {fmtSigned(stats.net, stats.count, stats.wins)}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

function fmtSigned(net: number, count: number, wins: number) {
  const pct = count ? (wins / count) * 100 : 0;
  return `${fmtMoney(net, "USD", 0)} · ${fmtPct(pct, 0)}`;
}
