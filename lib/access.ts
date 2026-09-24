import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The app has no accounts — every project is open to whoever has its URL.
 * This is the one lookup every project-scoped API route needs: does the
 * project exist, via the service-role client (there's no session to scope
 * a request-bound client by).
 */
export async function getProject(id: string) {
  const admin = createAdminClient();
  const { data: project } = await admin.from("projects").select("*").eq("id", id).single();
  if (!project) return { ok: false as const };
  return { ok: true as const, project, admin };
}

export function notFoundResponse() {
  return Response.json({ error: "not found" }, { status: 404 });
}
