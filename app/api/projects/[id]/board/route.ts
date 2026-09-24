import { getProject, notFoundResponse } from "@/lib/access";
import { loadBoard } from "@/lib/projectData";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const res = await getProject(params.id);
  if (!res.ok) return notFoundResponse();
  const { admin, project } = res;
  return Response.json(await loadBoard(admin, params.id, project.plan, project.budget));
}
