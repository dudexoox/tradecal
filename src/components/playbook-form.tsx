"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { Playbook } from "@/db/schema";
import type { FormState } from "@/app/actions";
import { Icon } from "./icons";

export function PlaybookForm({
  action,
  playbook,
  cancelHref,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  playbook?: Playbook;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="card overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-line px-6 py-4">
        <Icon name="book" size={17} className="text-brand" />
        <h2 className="text-sm font-semibold">{playbook ? "Edit playbook" : "New playbook"}</h2>
      </div>
      <div className="grid gap-5 p-6">
        <div>
          <label className="label" htmlFor="name">Playbook name <span className="text-brand">*</span></label>
          <input id="name" name="name" required maxLength={80} defaultValue={playbook?.name ?? ""}
            placeholder="e.g. London Session Playbook" className="field" />
        </div>
        <div>
          <label className="label" htmlFor="description">What belongs in this book</label>
          <textarea id="description" name="description" rows={3} defaultValue={playbook?.description ?? ""}
            placeholder="Markets, sessions or ideas this playbook covers — what you allow yourself to trade from it."
            className="field h-auto resize-y py-3 text-[13px] leading-relaxed" />
        </div>
      </div>
      {state?.error && <p role="alert" className="mx-6 mb-4 rounded-lg bg-down/8 px-3 py-2 text-xs text-down">{state.error}</p>}
      <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
        <Link href={cancelHref} className="btn-ghost">Cancel</Link>
        <button type="submit" disabled={pending} className="btn-primary">
          <Icon name="check" size={14} />
          {pending ? "Saving…" : playbook ? "Save playbook" : "Create playbook"}
        </button>
      </div>
    </form>
  );
}
