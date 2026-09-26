import { getProject, notFoundResponse } from "@/lib/access";
import { loadProjectData } from "@/lib/projectData";
import { MODELS } from "@/lib/gateway";
import { REPO_RE } from "@/lib/tools/github";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const res = await getProject(params.id);
  if (!res.ok) return notFoundResponse();
  return Response.json(await loadProjectData(res.admin, res.project));
}

/** Rename, or change the model / design system / codebase for later turns. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const res = await getProject(params.id);
  if (!res.ok) return notFoundResponse();
  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) update.title = body.title.trim().slice(0, 120);
  if (typeof body.model === "string" && body.model in MODELS) update.model_profile = body.model;
  if ("design_system_id" in body) update.design_system_id = typeof body.design_system_id === "string" && body.design_system_id ? body.design_system_id : null;
  if ("codebase" in body) update.codebase = typeof body.codebase === "string" && REPO_RE.test(body.codebase) ? body.codebase : null;
  if (!Object.keys(update).length) return Response.json({ error: "nothing to update" }, { status: 400 });
  const { error } = await res.admin.from("projects").update(update).eq("id", params.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const res = await getProject(params.id);
  if (!res.ok) return notFoundResponse();
  const { data: files } = await res.admin.from("files").select("storage_path").eq("project_id", params.id);
  if (files?.length) await res.admin.storage.from("artifacts").remove(files.map((f) => f.storage_path));
  const { error } = await res.admin.from("projects").delete().eq("id", params.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
