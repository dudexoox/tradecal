"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { claimLegacyData } from "@/lib/auth";
import type { FormState } from "./actions";

function str(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

/** Friendly error text for the common Supabase auth failures. */
function authError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "That email and password combination doesn't match an account.";
  if (m.includes("already registered")) return "An account with that email already exists — sign in instead.";
  if (m.includes("password")) return message;
  if (m.includes("rate") || m.includes("too many")) return "Too many attempts — wait a moment and try again.";
  return message;
}

export async function signIn(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: authError(error.message) };

  // A returning first user still completes the legacy claim if it never ran.
  if (data.user) await claimLegacyData(data.user.id);

  revalidatePath("/", "layout");
  const next = str(fd, "next");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function signUp(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  if (!email) return { error: "Enter your email address." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "That email address doesn't look right." };
  if (password.length < 8) return { error: "Use a password of at least 8 characters." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { error: authError(error.message) };

  // First signup claims the migrated journal; everyone else starts empty.
  if (data.user) await claimLegacyData(data.user.id);

  // With email confirmation disabled the session comes back immediately.
  if (!data.session) return { ok: true };

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
