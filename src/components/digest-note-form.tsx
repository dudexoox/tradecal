"use client";

import { useActionState, useState } from "react";
import { saveDigestNote } from "@/app/digest-actions";
import type { FormState } from "@/app/actions";
import { Icon } from "./icons";

export function DigestNoteForm({ digestId, note }: { digestId: number; note: string | null }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveDigestNote, null);
  /* Controlled so a rejected save keeps the note. */
  const [value, setValue] = useState(note ?? "");

  return (
    <form action={formAction} className="mt-4 border-t border-line pt-4">
      <input type="hidden" name="digestId" value={digestId} />
      <label className="label" htmlFor={`digest-note-${digestId}`}>
        Your note
      </label>
      <textarea
        id={`digest-note-${digestId}`}
        name="note"
        rows={2}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="What you want to remember from this period."
        className="field h-auto resize-y py-2.5 text-[12px] leading-relaxed"
      />
      <div className="mt-2 flex items-center justify-end gap-3">
        {state?.ok && <span className="text-[10px] text-up">Saved</span>}
        {state?.error && <span className="text-[10px] text-down">{state.error}</span>}
        <button type="submit" disabled={pending} className="btn-ghost h-8 px-3 text-[11px]">
          <Icon name="check" size={13} />
          {pending ? "Saving…" : "Save note"}
        </button>
      </div>
    </form>
  );
}
