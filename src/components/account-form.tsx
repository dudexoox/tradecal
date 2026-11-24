"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ACCOUNT_PHASES, type PublicAccount } from "@/db/schema";
import type { FormState } from "@/app/actions";
import { CsvImport } from "./csv-upload";
import { Icon } from "./icons";

const LABELS = { personal: "Personal account", challenge: "Evaluation", verification: "Verification", funded: "Funded account" };

export function AccountForm({
  action,
  account,
  liveMode = false,
  method,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  account?: PublicAccount;
  /** Server-reported: the local MT5 bridge is configured, so sync runs against real broker history. */
  liveMode?: boolean;
  /** Creation method chosen on /accounts?new=1 — absent when editing an existing account. */
  method?: "mt5" | "csv" | "manual";
}) {
  const [state, formAction, pending] = useActionState(action, null);
  // In MT5 sync mode the switch starts on; otherwise it starts off.
  const [mt5, setMt5] = useState(account?.mt5Enabled ?? method === "mt5");

  return (
    <form action={formAction} className="card overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-line px-6 py-4">
        <Icon name="wallet" size={17} className="text-brand" />
        <h2 className="text-sm font-semibold">{account ? "Account settings" : "A home for your trades"}</h2>
      </div>

      <div className="p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="name">Account name</label>
            <input id="name" name="name" required defaultValue={account?.name ?? ""} placeholder="e.g. My trading account" className="field" />
            <p className="mt-2 text-[10px] text-muted">Choose a name you’ll recognize in your journal.</p>
          </div>
          <div>
            <label className="label" htmlFor="startingBalance">Starting balance</label>
            <input id="startingBalance" name="startingBalance" type="number" step="any" min="0.01" inputMode="decimal" required defaultValue={account?.startingBalance ?? ""} placeholder="10000" className="field num" />
          </div>
          <div>
            <label className="label" htmlFor="currency">Account currency</label>
            <select id="currency" name="currency" defaultValue={account?.currency ?? "USD"} className="field">
              {[...new Set(["USD", "EUR", "GBP", "AUD", "CAD", "CHF", "JPY", "NZD", ...(account ? [account.currency] : [])])].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* ------------------------------------------------ MT5 auto-tracking */}
        <div className={`mt-7 rounded-xl border p-5 ${method === "csv" || method === "manual" ? "hidden" : "border-[#deebfc] bg-[#f8fbff]"}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-brand shadow-[0_2px_5px_#0781fe12]">
                <Icon name="download" size={16} />
              </span>
              <div>
                <h3 className="text-[13px] font-semibold">Track trades automatically with MetaTrader 5</h3>
                <p className="mt-1 max-w-lg text-[11px] leading-relaxed text-muted">
                  Connect your MT5 account number with an <strong className="font-medium text-fg">investor (read-only) password</strong> and every
                  closed trade is imported for you — no manual logging.
                </p>
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2.5">
              <input type="hidden" name="mt5Enabled" value={mt5 ? "on" : "off"} />
              <button type="button" role="switch" aria-checked={mt5} onClick={() => setMt5((v) => !v)} className="flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors" style={{ background: mt5 ? "#0781fe" : "#d9e0e9" }}>
                <span className="block h-5 w-5 rounded-full bg-white shadow-sm transition-transform" style={{ transform: `translateX(${mt5 ? 20 : 0}px)` }} />
              </button>
              <span className="text-xs font-medium">{mt5 ? "Automatic tracking on" : "Automatic tracking off"}</span>
            </label>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="mt5Login">MT5 account number</label>
              <input id="mt5Login" name="mt5Login" inputMode="numeric" autoComplete="off" defaultValue={account?.mt5Login ?? ""} placeholder="51234567" className="field num" />
            </div>
            <div>
              <label className="label" htmlFor="mt5Server">Broker server</label>
              <input id="mt5Server" name="mt5Server" autoComplete="off" defaultValue={account?.mt5Server ?? ""} placeholder="ICMarkets-Demo" className="field" />
            </div>
            <div>
              <label className="label" htmlFor="mt5InvestorPassword">Investor password</label>
              <input id="mt5InvestorPassword" name="mt5InvestorPassword" type="password" autoComplete="new-password" defaultValue="" placeholder={account?.hasMt5Password ? "Saved · leave blank to keep" : "Read-only password"} className="field" />
            </div>
          </div>

          <div className="mt-4 space-y-1.5 text-[10px] leading-relaxed text-muted">
            <p className="flex gap-2"><Icon name="info" size={13} className="mt-0.5 shrink-0 text-brand" />The investor password can only read balances, positions and history — it can never place, modify or close a trade. It is stored in this app’s database and never sent to your browser.</p>
            <p className="flex gap-2"><Icon name="clock" size={13} className="mt-0.5 shrink-0 text-brand" />History refreshes automatically when you open the dashboard, or on demand from the Accounts page. Trades arrive marked <span className="text-fg">MT5</span> and are never duplicated on re-sync.</p>
            {!liveMode ? (
              <p className="flex gap-2"><Icon name="flag" size={13} className="mt-0.5 shrink-0 text-brand" />The local MetaTrader 5 bridge isn’t set up on this machine yet, so sync can’t reach your broker. Run the Forex Journal bridge setup, then sync again.</p>
            ) : (
              <p className="flex gap-2"><Icon name="checkCircle" size={13} className="mt-0.5 shrink-0 text-up" />Local MT5 bridge configured — history is pulled from your broker on every sync.</p>
            )}
          </div>
        </div>

        {method === "csv" && (
          <div className="mt-7 rounded-xl border border-line p-5">
            <div className="mb-4 flex items-start gap-3">
              <span className="mt-0.5 text-brand"><Icon name="download" size={18} /></span>
              <div>
                <h3 className="text-[13px] font-semibold">Your trade history file</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">Choose the statement you exported and check the preview below — nothing is saved until you press Add account.</p>
              </div>
            </div>
            <CsvImport />
            <p className="mt-3 text-[10px] leading-relaxed text-muted">The balance and targets underneath are for your reporting only; every row in the file arrives as a trade on this account.</p>
          </div>
        )}

        <details className="mt-6 rounded-lg border border-line">
          <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-muted">Advanced account settings</summary>
          <div className="border-t border-line p-4">
            <label htmlFor="phase" className="label">Account type</label>
            <select id="phase" name="phase" defaultValue={account?.phase ?? "personal"} className="field">
              {ACCOUNT_PHASES.map((p) => <option key={p} value={p}>{LABELS[p]}</option>)}
            </select>
            <p className="mb-4 mt-5 text-xs font-medium">Optional targets</p>
            <div className="grid grid-cols-3 gap-3">
              <Percent name="profitTargetPct" label="Profit target" value={account?.profitTargetPct ?? 10} />
              <Percent name="maxDailyLossPct" label="Daily loss limit" value={account?.maxDailyLossPct ?? 5} />
              <Percent name="maxLossPct" label="Overall loss limit" value={account?.maxLossPct ?? 10} />
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-muted">Percentages of starting balance. These are optional account preferences, separate from your journal and performance reports.</p>
          </div>
        </details>

        {state?.error && <p role="alert" className="mt-5 rounded-lg bg-down/8 px-3 py-2 text-xs text-down">{state.error}</p>}
      </div>

      <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
        <Link href="/accounts" className="btn-ghost">Cancel</Link>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Saving…" : account ? "Save changes" : "Add account"}
          <Icon name="check" size={14} />
        </button>
      </div>
    </form>
  );
}

function Percent({ name, label, value }: { name: string; label: string; value: number }) {
  return (
    <div>
      <label className="label text-[10px]" htmlFor={name}>{label}</label>
      <div className="relative">
        <input id={name} name={name} type="number" step="any" min="0" max="100" defaultValue={value} className="field num pr-7" />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">%</span>
      </div>
    </div>
  );
}
