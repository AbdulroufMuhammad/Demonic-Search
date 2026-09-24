import { getProject, notFoundResponse } from "@/lib/access";
import { loadProjectData } from "@/lib/projectData";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const res = await getProject(params.id);
  if (!res.ok) return notFoundResponse();
  return Response.json(await loadProjectData(res.admin, res.project));
}
