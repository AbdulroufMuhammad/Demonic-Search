import { createAdminClient } from "@/lib/supabase/admin";
import { requireMain } from "@/lib/accessServer";
import { newKey, sha256Hex } from "@/lib/accessKeys";

export const dynamic = "force-dynamic";

const forbidden = () => Response.json({ error: "Only the main access key can manage keys." }, { status: 403 });
const MAX_DAYS = 365;

/** Temporary keys, newest first (main key only). */
export async function GET() {
  if (!(await requireMain())) return forbidden();
  const { data, error } = await createAdminClient()
    .from("access_keys")
    .select("id, name, hint, expires_at, revoked_at, last_used_at, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ keys: data });
}

/**
 * Create a temporary key (main key only). Body: { name, expiresAt } (ISO date)
 * or { name, hours }. The key is returned once and never stored in plain text.
 */
export async function POST(req: Request) {
  if (!(await requireMain())) return forbidden();
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim().slice(0, 80) || "Temporary key";
  const at = body?.expiresAt ? new Date(body.expiresAt).getTime() : Date.now() + Number(body?.hours) * 3_600_000;
  if (!Number.isFinite(at) || at <= Date.now() + 60_000) return Response.json({ error: "Pick an expiry at least a minute from now." }, { status: 400 });
  if (at > Date.now() + MAX_DAYS * 86_400_000) return Response.json({ error: `A temporary key can last at most ${MAX_DAYS} days.` }, { status: 400 });
  const key = newKey();
  const { data, error } = await createAdminClient()
    .from("access_keys")
    .insert({ name, key_hash: await sha256Hex(key), hint: key.slice(-4), expires_at: new Date(at).toISOString() })
    .select("id, name, hint, expires_at, revoked_at, last_used_at, created_at")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ key, record: data });
}
