import { getProject, notFoundResponse } from "@/lib/access";
import { runProject } from "@/lib/orchestrator";
import { sseResponse } from "@/lib/sse";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const res = await getProject(params.id);
  if (!res.ok) return notFoundResponse();
  const { admin, project } = res;

  const body = await req.json().catch(() => ({}));
  // A resume continues a run that paused itself mid-way through (see
  // pause() in lib/orchestrator.ts) rather than starting a new one, so it's
  // the one case where status "running" is expected, not a conflict.
  const resume = body?.resume === true;
  if (project.status === "running" && !resume) return Response.json({ error: "already running" }, { status: 409 });
  if (project.status !== "running" && resume) return Response.json({ error: "nothing to resume" }, { status: 409 });

  // Optional instructions typed before the run starts; the Writer reads them.
  if (typeof body?.message === "string" && body.message.trim()) {
    await admin.from("messages").insert({ project_id: params.id, role: "user", content: body.message.trim() });
  }

  return sseResponse((send) => runProject(admin, params.id, (e) => send(e), { resume }).then(() => undefined));
}
