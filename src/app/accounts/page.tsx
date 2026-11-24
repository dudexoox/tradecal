import Link from "next/link";
import { createAccount, deleteAccount, updateAccount } from "@/app/actions";
import { AccountForm } from "@/components/account-form";
import { DeleteButton } from "@/components/delete-button";
import { Mt5SyncControl } from "@/components/mt5-sync-control";
import { SetActiveButton } from "@/components/set-active-button";
import { Empty, PageTitle, Pnl } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { getAccountSummaries, getActiveAccount } from "@/lib/data";
import { bridgeConfigured } from "@/lib/mt5";
import { fmtMoney, fmtPct, fmtRelative } from "@/lib/format";

export const dynamic = "force-dynamic";

type Method = "mt5" | "csv" | "manual";

const OPTIONS: { key: Method; icon: IconName; title: string; blurb: string; points: string[] }[] = [
  {
    key: "mt5",
    icon: "download",
    title: "Sync from MetaTrader 5",
    blurb: "Connect your MT5 account with a read-only investor password and let the journal pull trades for you.",
    points: ["Nothing to type after setup", "Refreshes whenever you open the dashboard", "Investor password can never place a trade"],
  },
  {
    key: "csv",
    icon: "list",
    title: "Upload a CSV file",
    blurb: "Import a trade statement exported from MT4, MT5, cTrader or any broker or platform.",
    points: ["See exactly what will be imported first", "Deal rows grouped back into trades", "Re-importing the same file never duplicates"],
  },
  {
    key: "manual",
    icon: "pen",
    title: "Enter it manually",
    blurb: "Create the account yourself and type each trade into the journal as you take it.",
    points: ["Full control over every field", "Add charts, notes and setup pictures", "No external connection needed"],
  },
];

function importBanner(sp: { added?: string; via?: string; syncError?: string }) {
  if (sp.syncError)
    return {
      tone: "border-brand/25 bg-brand/6 text-brand",
      icon: "info" as IconName,
      text: "Account created, but the first MetaTrader 5 sync did not run. Press Sync now on the card below — your login and server details are saved.",
    };
  if (!sp.added) return null;
  const count = Number(sp.added) || 0;
  const text =
    sp.via === "csv"
      ? `Imported ${count} ${count === 1 ? "trade" : "trades"} from your CSV file.`
      : count > 0
        ? `Connected to MetaTrader 5 and imported ${count} ${count === 1 ? "trade" : "trades"}.`
        : "Connected to MetaTrader 5 — your history is already up to date.";
  return { tone: "border-up/25 bg-up/6 text-up", icon: "checkCircle" as IconName, text };
}

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; edit?: string; method?: string; added?: string; via?: string; syncError?: string }>;
}) {
  const sp = await searchParams;
  const [summaries, { account: active }] = await Promise.all([getAccountSummaries(), getActiveAccount()]);
  const editId = sp.edit ? Number(sp.edit) : null;
  const editing = editId ? summaries.find((s) => s.account.id === editId)?.account : undefined;
  const method: Method | undefined =
    sp.method === "mt5" || sp.method === "csv" || sp.method === "manual" ? sp.method : undefined;
  const choosing = Boolean(sp.new) && !editing && !method;
  const showForm = Boolean((sp.new && method) || editing);
  const banner = importBanner(sp);

  /* ---------------------------------- choose how to add ---------------------------------- */
  if (choosing) {
    return (
      <div className="mx-auto max-w-4xl">
        <Link href="/accounts" className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted hover:text-brand">
          <Icon name="arrow" size={13} className="rotate-180" />Back to accounts
        </Link>
        <PageTitle title="Add an account" subtitle="How would you like to get your trades into the journal?" />
        <div className="grid gap-4 md:grid-cols-3">
          {OPTIONS.map((o) => (
            <Link key={o.key} href={`/accounts?new=1&method=${o.key}`} className="group card flex flex-col p-6 transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[0_6px_20px_#1c41630a]">
              <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-brand/7 text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                <Icon name={o.icon} size={21} />
              </span>
              <h2 className="text-[15px] font-semibold tracking-[-0.3px]">{o.title}</h2>
              <p className="mt-2 flex-1 text-xs leading-relaxed text-muted">{o.blurb}</p>
              <ul className="mt-5 space-y-2 border-t border-line pt-4">
                {o.points.map((p) => (
                  <li key={p} className="flex gap-2 text-[11px] leading-relaxed text-muted">
                    <Icon name="check" size={12} className="mt-0.5 shrink-0 text-up" />
                    {p}
                  </li>
                ))}
              </ul>
              <span className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-brand">
                Continue <Icon name="arrow" size={13} className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
        <p className="mt-6 flex items-center gap-2 text-[11px] text-muted">
          <Icon name="info" size={13} />
          You can change how an account syncs later from its settings.
        </p>
      </div>
    );
  }

  /* ------------------------------------ the form ----------------------------------------- */
  if (showForm) {
    const heading = editing
      ? "Account settings"
      : method === "mt5"
        ? "Sync from MetaTrader 5"
        : method === "csv"
          ? "Upload a CSV file"
          : "Enter manually";
    const sub = editing
      ? "Keep your trading history organized — your way."
      : method === "mt5"
        ? "Your broker details go in; the trades arrive on their own."
        : method === "csv"
          ? "Pick the file first — you’ll see what will be imported before anything is saved."
          : "Type in the details, then log trades one at a time.";

    return (
      <div className="mx-auto max-w-[750px]">
        <Link href={editing ? "/accounts" : "/accounts?new=1"} className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted hover:text-brand">
          <Icon name="arrow" size={13} className="rotate-180" />
          {editing ? "Back to accounts" : "Choose another way"}
        </Link>
        <PageTitle title={editing ? `${heading} · ${editing.name}` : heading} subtitle={sub} />
        <AccountForm
          key={editing?.id ?? method}
          action={editing ? updateAccount.bind(null, editing.id) : createAccount}
          account={editing}
          method={editing ? undefined : method}
          liveMode={bridgeConfigured()}
        />
        {editing?.mt5Enabled && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-panel px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/6 text-brand"><Icon name="download" size={17} /></span>
              <div>
                <p className="text-xs font-medium">MetaTrader 5 connection</p>
                <p className="mt-0.5 text-[10px] text-muted">
                  #{editing.mt5Login} · {editing.mt5Server} · last sync {fmtRelative(editing.mt5LastSyncAt)}
                  {editing.mt5Mode === "demo" ? " · demo mode" : ""}
                </p>
              </div>
            </div>
            <Mt5SyncControl accountId={editing.id} />
          </div>
        )}
      </div>
    );
  }

  /* ----------------------------------- the account list ---------------------------------- */
  return (
    <>
      <PageTitle
        title="Accounts"
        subtitle="Different accounts. One place to learn from your trading."
        action={
          <Link href="/accounts?new=1" className="btn-primary">
            <Icon name="plus" size={16} />Add account
          </Link>
        }
      />

      {banner && (
        <div className={`mb-5 flex items-start gap-2.5 rounded-lg border px-4 py-3 text-xs ${banner.tone}`} role="status">
          <Icon name={banner.icon} size={15} className="mt-0.5 shrink-0" />
          <span>{banner.text}</span>
        </div>
      )}

      {summaries.length ? (
        <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {summaries.map(({ account, tradeCount, netPnl, syncedCount }) => {
            const isActive = active?.id === account.id;
            const ret = netPnl / account.startingBalance * 100;
            const error = account.mt5Status === "error";
            return (
              <article key={account.id} className={`card overflow-hidden ${isActive ? "border-brand/30" : ""}`}>
                <div className="p-5">
                  <div className="mb-5 flex items-center justify-between gap-2">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/6 text-brand"><Icon name="wallet" size={20} /></span>
                    {isActive ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/6 px-2.5 py-1 text-[10px] font-medium text-brand">
                        <span className="h-1.5 w-1.5 rounded-full bg-brand" />Active account
                      </span>
                    ) : (
                      <SetActiveButton accountId={account.id} />
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[15px] font-semibold tracking-[-0.3px]">{account.name}</h2>
                    {account.mt5Enabled && (
                      <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-medium ${error ? "border-down/25 bg-down/6 text-down" : "border-up/25 bg-up/6 text-up"}`}>
                        <Icon name="download" size={10} />
                        {error ? "MT5 sync error" : account.mt5Mode === "live" ? "MT5 auto" : "MT5 demo"}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-[10px] text-muted">{account.currency} · {tradeCount} {tradeCount === 1 ? "trade" : "trades"} logged{syncedCount > 0 ? ` · ${syncedCount} auto-tracked` : ""}</p>

                  <div className="mt-6 flex items-baseline justify-between">
                    <div>
                      <span className="block text-[10px] text-muted">Current balance</span>
                      <span className="num mt-1.5 block text-[26px] font-semibold tracking-[-0.9px]">{fmtMoney(account.startingBalance + netPnl, account.currency)}</span>
                    </div>
                    <span className={`num rounded-md px-1.5 py-1 text-[10px] ${ret >= 0 ? "bg-up/7 text-up" : "bg-down/7 text-down"}`}>{ret > 0 ? "+" : ""}{fmtPct(ret, 2)}</span>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4">
                    <div>
                      <p className="text-[10px] text-muted">Starting balance</p>
                      <p className="num mt-1.5 text-xs font-medium">{fmtMoney(account.startingBalance, account.currency)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted">Net P&amp;L</p>
                      <p className="mt-1.5 text-xs font-medium"><Pnl value={netPnl} currency={account.currency} /></p>
            </div>
                  </div>

                  {account.mt5Enabled && (
                    <div className="mt-5 rounded-lg border border-line bg-panel-2/40 p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-medium">MetaTrader 5 · #{account.mt5Login}</span>
                        <span className="text-[9px] text-muted">{account.mt5Server}</span>
                      </div>
                      <p className={`mt-1.5 text-[10px] ${error ? "text-down" : "text-muted"}`}>
                        {error ? account.mt5LastError : `Last sync ${fmtRelative(account.mt5LastSyncAt)}${account.mt5LastSyncAt ? ` · ${account.mt5LastImported} new` : ""}`}
                      </p>
                      <div className="mt-3"><Mt5SyncControl accountId={account.id} /></div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-line bg-panel-2/30 px-5 py-3">
                  <Link href={`/accounts?edit=${account.id}`} className="text-link text-[11px]"><Icon name="settings" size={12} />Account settings</Link>
                  <DeleteButton action={deleteAccount.bind(null, account.id)} confirmText={`Delete "${account.name}" and its ${tradeCount} trades? This cannot be undone.`} className="px-1 text-[10px] text-muted hover:text-down disabled:opacity-50" />
                </div>
              </article>
            );
          })}
        </div>
      ) : banner ? (
        <p className="py-10 text-center text-sm text-muted">Add an account to start your journal.</p>
      ) : (
        <Empty title="Your trading, all together" body="Add an account to give your trade history a home — by MT5 sync, CSV import or by hand." action={{ href: "/accounts?new=1", label: "Add your first account" }} />
      )}

      <p className="mt-7 flex items-center gap-2 text-[11px] text-muted">
        <Icon name="info" size={13} />
        Switch accounts at the top of any page. Your notebook stays with your workspace.
      </p>
    </>
  );
}
