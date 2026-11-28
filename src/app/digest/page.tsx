import Link from "next/link";
import { DigestNoteForm } from "@/components/digest-note-form";
import { Icon } from "@/components/icons";
import { Empty, PageTitle } from "@/components/ui";
import { getActiveAccount, getActiveRuleCount, getRoutineHistory, getTrades } from "@/lib/data";
import { requireUser } from "@/lib/auth";
import { ensureDigests, periodStarts } from "@/lib/digest-store";
import { dayKey, fmtDateShort, fmtPct, fmtR } from "@/lib/format";

export const dynamic = "force-dynamic";

const WEEK_COUNT = 12;
const MONTH_COUNT = 6;

export default async function DigestPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const sp = await searchParams;
  const period: "week" | "month" = sp.period === "month" ? "month" : "week";
  const { account } = await getActiveAccount();
  if (!account)
    return (
      <Empty
        title="Your week, written up"
        body="Add an account and tradeCal will summarise every week and month from your own numbers."
        action={{ href: "/accounts?new=1", label: "Add account" }}
      />
    );

  const count = period === "week" ? WEEK_COUNT : MONTH_COUNT;
  const starts = periodStarts(period, count);
  const earliest = starts[0];

  const [userId, trades, history, activeRules] = await Promise.all([
    requireUser(),
    getTrades(account.id),
    getRoutineHistory(dayKey(earliest)),
    getActiveRuleCount(),
  ]);

  const digests = await ensureDigests({
    userId,
    accountId: account.id,
    period,
    currency: account.currency,
    trades,
    history,
    activeRules,
    count,
  });

  const currency = account.currency;
  const tabHref = (id: "week" | "month") => `/digest?period=${id}`;

  return (
    <>
      <PageTitle
        title="Performance digest"
        subtitle="Each week and month, written up from your own numbers."
        action={
          <Link href="/reports" className="btn-ghost">
            <Icon name="chart" size={15} />
            Full reports
          </Link>
        }
      />

      <div className="mb-5 flex items-center gap-5 border-b border-line">
        {(["week", "month"] as const).map((id) => (
          <Link
            key={id}
            href={tabHref(id)}
            aria-current={period === id ? "page" : undefined}
            className={`-mb-px border-b-2 pb-3 text-xs font-medium capitalize transition-colors ${
              period === id ? "border-brand font-semibold text-brand" : "border-transparent text-muted hover:text-fg"
            }`}
          >
            {id === "week" ? "Weekly" : "Monthly"}
          </Link>
        ))}
        <span className="ml-auto hidden pb-3 text-[10px] text-muted sm:block">{digests.length} digests</span>
      </div>

      <div className="space-y-4">
        {digests.length === 0 && (
          <Empty
            title="No digest yet"
            body="Log a few trades and the first summary will write itself."
            action={{ href: "/trades/new", label: "Log a trade" }}
          />
        )}

        {digests.map((digest) => {
          const metrics = digest.metrics;
          const start = new Date(digest.periodStart);
          const label =
            period === "month"
              ? start.toLocaleString("en-US", { month: "long", year: "numeric" })
              : `Week of ${fmtDateShort(start)}`;
          const tone = metrics.pnl > 0 ? "text-up" : metrics.pnl < 0 ? "text-down" : "text-muted";
          return (
            <article key={digest.id} className="card px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-xs font-semibold">{label}</h2>
                  <p className={`num mt-1.5 text-[22px] font-semibold leading-none tracking-[-0.7px] ${tone}`}>
                    {metrics.pnl > 0 ? "+" : metrics.pnl < 0 ? "−" : ""}
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency,
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    }).format(Math.abs(metrics.pnl ?? 0))}
                  </p>
                </div>
                <Link
                  href={`/day-view?date=${digest.periodStart}`}
                  className="text-link shrink-0 text-[11px]"
                >
                  Open the days<Icon name="arrow" size={12} />
                </Link>
              </div>

              <p className="mt-3 text-[13px] leading-[1.8] text-muted">{digest.summary}</p>

              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 sm:grid-cols-4">
                <div>
                  <dt className="text-[10px] text-dim">Trades</dt>
                  <dd className="num mt-1 text-xs font-medium">{metrics.trades ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-[10px] text-dim">Win rate</dt>
                  <dd className="num mt-1 text-xs font-medium">{fmtPct(metrics.winRate ?? 0, 0)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] text-dim">Total R</dt>
                  <dd className="num mt-1 text-xs font-medium">{fmtR(metrics.totalR ?? null)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] text-dim">Routine</dt>
                  <dd className="num mt-1 text-xs font-medium">
                    {metrics.rulesTotal ? `${metrics.rulePct ?? 0}%` : "—"}
                  </dd>
                </div>
              </dl>

              <DigestNoteForm digestId={digest.id} note={digest.note} />
            </article>
          );
        })}
      </div>
    </>
  );
}
