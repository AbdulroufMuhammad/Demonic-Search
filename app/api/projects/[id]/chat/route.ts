import { getProject, notFoundResponse } from "@/lib/access";
import { runEdit } from "@/lib/orchestrator";
import { sseResponse } from "@/lib/sse";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** A chat message on a finished artifact: the Writer edits index.html and replies. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const res = await getProject(params.id);
  if (!res.ok) return notFoundResponse();
  const { admin, project } = res;
  if (project.status === "running") return Response.json({ error: "a run is in progress" }, { status: 409 });

  const { message, target } = await req.json();
  if (!message || typeof message !== "string") return Response.json({ error: "message is required" }, { status: 400 });
  const tgt =
    target && typeof target.id === "string" ? { id: String(target.id), tag: String(target.tag ?? target.id) } : null;

  await admin.from("messages").insert({
    project_id: params.id,
    role: "user",
    content: tgt ? `[${tgt.tag}] ${message}` : message,
  });
  return sseResponse((send) => runEdit(admin, params.id, message, tgt, (e) => send(e)));
}
