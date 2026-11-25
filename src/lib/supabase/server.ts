import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client bound to the request cookies, for Server Components,
 * Server Actions and route handlers. Session cookies are read and refreshed
 * through `@supabase/ssr`, so the auth state stays on the server.
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called during a Server Component render — the proxy refreshes
          // sessions instead, so silently ignoring this is safe.
        }
      },
    },
  });
}
