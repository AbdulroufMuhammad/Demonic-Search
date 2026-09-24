import { getProjectAccess, denied } from "@/lib/access";
import { loadProjectData } from "@/lib/projectData";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const res = await getProjectAccess(params.id);
  if (!res.ok) return denied(res.status);
  return Response.json(await loadProjectData(res.access.admin, res.access.project));
}

/** Owner-only settings: link sharing. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const res = await getProjectAccess(params.id, "owner");
  if (!res.ok) return denied(res.status);
  const { share_access } = await req.json();
  if (!["private", "view", "edit"].includes(share_access))
    return Response.json({ error: "share_access must be private, view or edit" }, { status: 400 });
  const { error } = await res.access.admin.from("projects").update({ share_access }).eq("id", params.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ share_access });
}
