"use client";

import { useActionState, useState } from "react";
import { addSessionMarker } from "@/app/session-actions";
import type { FormState } from "@/app/actions";
import { SESSION_MARKER_KINDS } from "@/db/schema";
import { Icon } from "./icons";

export function SessionMarkerForm({
  accountId,
  markerDate,
  defaultTime,
}: {
  accountId: number;
  markerDate: string;
  defaultTime: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(addSessionMarker, null);
  /* Controlled so a rejected note is not lost. */
  const [note, setNote] = useState("");
  const [at, setAt] = useState(defaultTime);

  return (
    <form action={formAction} className="rounded-lg border border-line bg-panel-2/40 p-4">
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="markerDate" value={markerDate} />
      <div className="grid gap-3 sm:grid-cols-[130px_150px_minmax(0,1fr)]">
        <div>
          <label className="label" htmlFor="marker-kind">
            Kind
          </label>
          <select id="marker-kind" name="kind" defaultValue="note" className="field h-9 text-xs">
            {SESSION_MARKER_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind === "note" ? "Note" : kind === "plan" ? "Plan" : kind === "mistake" ? "Mistake" : "Win"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="marker-at">
            Time
          </label>
          <input id="marker-at" name="at" type="time" value={at} onChange={(event) => setAt(event.target.value)} className="field num h-9 text-xs" />
        </div>
        <div>
          <label className="label" htmlFor="marker-note">
            What happened
          </label>
          <input
            id="marker-note"
            name="note"
            required
            maxLength={1000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. Missed the London open entry"
            className="field h-9 text-xs"
          />
        </div>
      </div>
      {state?.error && (
        <p role="alert" className="mt-3 rounded-lg bg-down/7 px-3 py-2 text-[11px] text-down">
          {state.error}
        </p>
      )}
      <div className="mt-3 flex justify-end">
        <button type="submit" disabled={pending} className="btn-ghost h-9">
          <Icon name="plus" size={14} />
          {pending ? "Pinning…" : "Pin to the timeline"}
        </button>
      </div>
    </form>
  );
}
