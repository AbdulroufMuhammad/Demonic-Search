import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type ShareAccess = "private" | "view" | "edit";
export type ProjectAccess = {
  user: User;
  project: any;
  isOwner: boolean;
  /** Service-role client; callers must only touch this project's rows. */
  admin: SupabaseClient;
};

/**
 * Owners can do anything. When a project is shared with "edit" access, any
 * signed-in user with the link can open the workspace and prompt the Writer.
 * "view" links only open the read-only page at /p/[id].
 */
export async function getProjectAccess(
  projectId: string,
  need: "write" | "owner" = "write"
): Promise<{ ok: true; access: ProjectAccess } | { ok: false; status: 401 | 404 }> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, status: 401 };

  const admin = createAdminClient();
  const { data: project } = await admin.from("projects").select("*").eq("id", projectId).single();
  if (!project) return { ok: false, status: 404 };

  const isOwner = project.owner_id === auth.user.id;
  const allowed = isOwner || (need === "write" && project.share_access === "edit");
  if (!allowed) return { ok: false, status: 404 };
  return { ok: true, access: { user: auth.user, project, isOwner, admin } };
}

export function denied(status: 401 | 404) {
  return Response.json({ error: status === 401 ? "unauthenticated" : "not found" }, { status });
}
