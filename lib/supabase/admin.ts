import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client: bypasses RLS. Server-only.
 *
 * Every request opts out of Next.js's fetch cache. Without this, a read made
 * while a file didn't exist yet (e.g. the canvas asking for a design mid-write)
 * was cached and replayed afterwards, so the finished file kept 404ing.
 */
export function createAdminClient() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}
