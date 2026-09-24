import { getProject, notFoundResponse } from "@/lib/access";
import { readArtifact } from "@/lib/projectData";

export const dynamic = "force-dynamic";

/** Raw HTML of the latest version, for the canvas (rendered via a sandboxed srcdoc iframe). */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const res = await getProject(params.id);
  if (!res.ok) return notFoundResponse();
  const path = new URL(req.url).searchParams.get("path") ?? "index.html";
  const file = await readArtifact(res.admin, params.id, path);
  if (!file) return Response.json({ error: "file not found" }, { status: 404 });
  return Response.json(file);
}
