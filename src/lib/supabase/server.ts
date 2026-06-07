import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Supabase client for use on the server (Server Components, Server Actions,
 * Route Handlers). It reads/writes the auth session via cookies.
 *
 * NOTE (Next.js 16): `cookies()` is async and must be awaited.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component (which cannot set cookies).
            // The proxy (proxy.ts) refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  );
}

/**
 * Admin client using the SERVICE ROLE key. This BYPASSES Row Level Security,
 * so only use it on trusted server code (e.g. the cron route and admin-only
 * actions like inviting users). Never expose the service role key to the browser.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
