"use client";

import { useActionState } from "react";
import { syncMt5Account, type SyncState } from "@/app/actions";
import { Icon } from "./icons";

export function Mt5SyncControl({ accountId }: { accountId: number }) {
  const [state, formAction, pending] = useActionState<SyncState, FormData>(
    syncMt5Account.bind(null, accountId),
    null,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-8 items-center gap-2 rounded-lg border border-line-2 bg-white px-3 text-[11px] font-medium text-fg transition-colors hover:border-brand/40 hover:text-brand disabled:cursor-wait disabled:opacity-60"
      >
        <Icon name="download" size={13} className={pending ? "animate-pulse" : ""} />
        {pending ? "Syncing…" : "Sync now"}
      </button>
      {state && (
        <span role="status" className={`text-[10px] ${state.ok ? "text-up" : "text-down"}`}>
          {state.message}
        </span>
      )}
    </form>
  );
}
