import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16: the old "middleware.ts" convention is now "proxy.ts".
// This runs before routes render and keeps the Supabase session fresh.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Run on everything EXCEPT static assets, image optimizer, favicon,
  // and the cron API route (which authenticates with its own secret).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
