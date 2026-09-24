import { getProjectAccess, denied } from "@/lib/access";
import { loadBoard } from "@/lib/projectData";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const res = await getProjectAccess(params.id);
  if (!res.ok) return denied(res.status);
  const { admin, project } = res.access;
  return Response.json(await loadBoard(admin, params.id, project.plan, project.budget));
}
