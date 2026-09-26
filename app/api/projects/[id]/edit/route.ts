import { getProject, notFoundResponse } from "@/lib/access";
import { readFile } from "@/lib/projectData";
import { makeFileTools } from "@/lib/tools/files";
import { applyElementEdits, applyTweakValues } from "@/lib/finalize";

export const dynamic = "force-dynamic";

/**
 * Direct changes that don't go through the agent, each saved as a new
 * version: Edit-mode element edits, tweak values, or restoring an older
 * version as the latest.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const res = await getProject(params.id);
  if (!res.ok) return notFoundResponse();
  const { admin } = res;
  const body = await req.json().catch(() => ({}));
  const path = String(body.path ?? "");

  const file = await readFile(admin, params.id, path, Number(body.restore) || undefined);
  if (!file) return Response.json({ error: "file not found" }, { status: 404 });

  let html = file.content;
  try {
    if (Array.isArray(body.edits) && body.edits.length) html = applyElementEdits(html, body.edits);
    if (body.tweaks && typeof body.tweaks === "object") html = applyTweakValues(html, body.tweaks);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
  if (!body.restore && html === file.content) return Response.json({ version: file.version });

  const saved = await makeFileTools(admin, params.id).write_file({ path, content: html });
  await admin.from("projects").update({ updated_at: new Date().toISOString() }).eq("id", params.id);
  return Response.json({ version: saved.version });
}
