import { getProject, notFoundResponse } from "@/lib/access";
import { readFile } from "@/lib/projectData";

export const dynamic = "force-dynamic";

/** A file's HTML (latest, or a specific version) for the canvas. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const res = await getProject(params.id);
  if (!res.ok) return notFoundResponse();
  const sp = new URL(req.url).searchParams;
  const path = sp.get("path") ?? "";
  const version = Number(sp.get("version")) || undefined;
  const file = await readFile(res.admin, params.id, path, version);
  if (!file) return Response.json({ error: "file not found" }, { status: 404 });
  return Response.json(file);
}
