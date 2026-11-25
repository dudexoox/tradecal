import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { Logo } from "@/components/header";
import { signIn } from "@/app/auth-actions";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sign in — tradeVSL" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getUser();
  if (user) redirect("/");
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-[400px]">
        {/* Logo already renders its own home link. */}
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <AuthForm action={signIn} mode="login" next={safeNext} />
        <p className="mt-4 text-center text-[11px] leading-relaxed text-dim">
          Each account sees only its own trading data.
        </p>
      </div>
    </div>
  );
}
