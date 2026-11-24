"use client";

import { useTransition } from "react";

export function DeleteButton({
  action,
  label = "Delete",
  confirmText = "Delete this item? This cannot be undone.",
  className = "btn-danger",
}: {
  action: () => Promise<void>;
  label?: string;
  confirmText?: string;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={className}
      onClick={() => {
        if (!window.confirm(confirmText)) return;
        startTransition(async () => {
          await action();
        });
      }}
    >
      {pending ? "Deleting…" : label}
    </button>
  );
}
