"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setActiveAccount } from "@/app/actions";

export function SetActiveButton({ accountId }: { accountId: number }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await setActiveAccount(accountId);
          router.refresh();
        })
      }
      className="h-8 rounded-md px-2.5 text-xs text-muted transition-colors hover:bg-panel-2 hover:text-fg disabled:opacity-50"
    >
      {pending ? "Switching…" : "Make active"}
    </button>
  );
}
