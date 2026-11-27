"use client";

import { useActionState, useEffect, useRef } from "react";
import { createTag } from "@/app/tag-actions";
import { Icon } from "./icons";

export function TagCreateForm() {
  const [state, formAction, pending] = useActionState(createTag, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-start gap-2">
      <div className="min-w-[180px] flex-1">
        <label className="sr-only" htmlFor="tag-name">
          New tag name
        </label>
        <input
          id="tag-name"
          name="name"
          required
          maxLength={30}
          placeholder="New tag, e.g. FOMO entry"
          className="field h-10"
        />
      </div>
      <button type="submit" disabled={pending} className="btn-primary h-10">
        <Icon name="plus" size={14} />
        {pending ? "Adding…" : "Add tag"}
      </button>
      {state?.error && (
        <p role="alert" className="w-full rounded-lg bg-down/7 px-3 py-2 text-[11px] text-down">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="w-full text-[11px] text-up">
          Tag added. It is ready to use on your next trade.
        </p>
      )}
    </form>
  );
}
