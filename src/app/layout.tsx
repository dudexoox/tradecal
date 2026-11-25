import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Header } from "@/components/header";
import { getUser } from "@/lib/auth";
import "./globals.css";

/** Runs before first paint so a persisted collapsed sidebar has no layout flash.
 *  Lives here (not in a "use client" module) — client-module exports arrive as
 *  references, not strings, when imported into a server component. */
const SIDEBAR_BOOT_SCRIPT = `try{if(localStorage.getItem("tvsl:side")==="collapsed")document.documentElement.setAttribute("data-side","collapsed")}catch(e){}`;

export const metadata: Metadata = {
  title: "tradeVSL — Find your trading edge",
  description: "tradeVSL — log your trades, review your sessions, and understand your edge.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getUser();
  return (
    <html lang="en">
      <body className="min-h-screen">
        {/* restores a collapsed sidebar before first paint — no layout flash */}
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_BOOT_SCRIPT }} />
        {user ? (
          <>
            <Header />
            <main className="workspace-main">
              <div className="workspace-inner">{children}</div>
            </main>
          </>
        ) : (
          /* Auth pages render their own centered layout — no app shell. */
          <>{children}</>
        )}
      </body>
    </html>
  );
}
