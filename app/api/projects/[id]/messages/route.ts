import { getProjectAccess, denied } from "@/lib/access";

/** Messages sent while a run is going. They queue for the Writer (see queuedInstructions). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const res = await getProjectAccess(params.id);
  if (!res.ok) return denied(res.status);
  const { content } = await req.json();
  if (!content || typeof content !== "string") return Response.json({ error: "content is required" }, { status: 400 });
  const { data, error } = await res.access.admin
    .from("messages")
    .insert({ project_id: params.id, role: "user", content })
    .select("id, role, content, created_at")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ message: data });
}
