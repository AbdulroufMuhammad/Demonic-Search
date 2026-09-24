import { getProject, notFoundResponse } from "@/lib/access";
import { readArtifact } from "@/lib/projectData";
import { makeFileTools } from "@/lib/tools/files";
import { applyElementEdit } from "@/lib/report/finalize";

export const dynamic = "force-dynamic";

/** Inspector direct edits: text of uncited elements, and size / line height / space after. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const res = await getProject(params.id);
  if (!res.ok) return notFoundResponse();
  const { admin } = res;
  const { path = "index.html", edits } = await req.json();
  if (!Array.isArray(edits) || !edits.length) return Response.json({ error: "edits are required" }, { status: 400 });

  const file = await readArtifact(admin, params.id, path);
  if (!file) return Response.json({ error: "file not found" }, { status: 404 });
  let html = file.content;
  try {
    for (const e of edits) html = applyElementEdit(html, String(e.id), { text: e.text, style: e.style });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
  const saved = await makeFileTools(admin, params.id).write_file({ path, content: html });
  await admin.from("projects").update({ updated_at: new Date().toISOString() }).eq("id", params.id);
  return Response.json({ version: saved.version });
}
