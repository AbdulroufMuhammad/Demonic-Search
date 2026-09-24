import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client: bypasses RLS. Server-only — the orchestrator and agent
 * tools run outside a user request context and need to read/write the board
 * (sources, claims, files, events) regardless of row ownership checks.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
