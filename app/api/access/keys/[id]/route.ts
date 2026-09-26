import { createAdminClient } from "@/lib/supabase/admin";
import { requireMain } from "@/lib/accessServer";
import { forgetKeyStatus } from "@/lib/accessKeys";

export const dynamic = "force-dynamic";

/** Revoke a temporary key (main key only). It stops working within about 30 seconds everywhere. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await requireMain())) return Response.json({ error: "Only the main access key can manage keys." }, { status: 403 });
  const { data, error } = await createAdminClient()
    .from("access_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", params.id)
    .is("revoked_at", null)
    .select("id, name, hint, expires_at, revoked_at, last_used_at, created_at");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  forgetKeyStatus(params.id);
  return Response.json({ record: data?.[0] ?? null });
}
