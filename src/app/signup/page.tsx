import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { Logo } from "@/components/header";
import { signUp } from "@/app/auth-actions";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Create account — tradeCal" };

export default async function SignupPage() {
  const user = await getUser();
  if (user) redirect("/");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-[400px]">
        {/* Logo already renders its own home link. */}
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <AuthForm action={signUp} mode="signup" />
        <p className="mt-4 text-center text-[11px] leading-relaxed text-dim">
          Your journal stays private to your account.
        </p>
      </div>
    </div>
  );
}
