import { getProject, notFoundResponse } from "@/lib/access";

export const dynamic = "force-dynamic";

/** Resolve (or reopen) a comment: it stays in the chat but its pin leaves the canvas. */
export async function PATCH(req: Request, { params }: { params: { id: string; mid: string } }) {
  const res = await getProject(params.id);
  if (!res.ok) return notFoundResponse();
  const body = await req.json().catch(() => ({}));
  if (typeof body.resolved !== "boolean") return Response.json({ error: "resolved (boolean) is required" }, { status: 400 });

  const { data: msg } = await res.admin.from("messages").select("meta").eq("id", params.mid).eq("project_id", params.id).single();
  if (!msg) return notFoundResponse();
  const meta = { ...(msg.meta ?? {}), resolved: body.resolved };
  const { error } = await res.admin.from("messages").update({ meta }).eq("id", params.mid);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ meta });
}
