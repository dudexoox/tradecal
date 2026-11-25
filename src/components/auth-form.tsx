"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { FormState } from "@/app/actions";
import { Icon } from "./icons";

export function AuthForm({
  action,
  mode,
  next,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  mode: "login" | "signup";
  next?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const isLogin = mode === "login";

  return (
    <form action={formAction} className="card overflow-hidden">
      <div className="border-b border-line px-6 py-4">
        <h1 className="text-sm font-semibold">{isLogin ? "Sign in" : "Create your account"}</h1>
        <p className="mt-1 text-xs text-muted">
          {isLogin ? "Welcome back — your journal is where you left it." : "Your trades, playbook and journal — private to you."}
        </p>
      </div>
      <div className="grid gap-5 p-6">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" autoFocus
            placeholder="you@example.com" className="field" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required
            autoComplete={isLogin ? "current-password" : "new-password"}
            placeholder={isLogin ? "Your password" : "At least 8 characters"}
            minLength={isLogin ? undefined : 8} className="field" />
        </div>
        {next && <input type="hidden" name="next" value={next} />}
        {state?.error && (
          <p role="alert" className="rounded-lg bg-down/8 px-3 py-2 text-xs text-down">{state.error}</p>
        )}
        {state?.ok && (
          <p role="status" className="rounded-lg bg-up/8 px-3 py-2 text-xs text-up">
            Account created — sign in to open your journal.
          </p>
        )}
        <button type="submit" disabled={pending} className="btn-primary w-full">
          {pending ? (isLogin ? "Signing in…" : "Creating account…") : isLogin ? "Sign in" : "Create account"}
        </button>
      </div>
      <div className="border-t border-line px-6 py-4 text-center text-xs text-muted">
        {isLogin ? (
          <>No account yet? <Link href="/signup" className="text-link">Create one<Icon name="arrow" size={13}/></Link></>
        ) : (
          <>Already have an account? <Link href="/login" className="text-link">Sign in<Icon name="arrow" size={13}/></Link></>
        )}
      </div>
    </form>
  );
}
