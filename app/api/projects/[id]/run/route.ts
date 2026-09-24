import { getProject, notFoundResponse } from "@/lib/access";
import { runProject } from "@/lib/orchestrator";
import { sseResponse } from "@/lib/sse";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const res = await getProject(params.id);
  if (!res.ok) return notFoundResponse();
  const { admin, project } = res;
  if (project.status === "running") return Response.json({ error: "already running" }, { status: 409 });

  // Optional instructions typed before the run starts; the Writer reads them.
  const body = await req.json().catch(() => ({}));
  if (typeof body?.message === "string" && body.message.trim()) {
    await admin.from("messages").insert({ project_id: params.id, role: "user", content: body.message.trim() });
  }

  return sseResponse((send) => runProject(admin, params.id, (e) => send(e)).then(() => undefined));
}
