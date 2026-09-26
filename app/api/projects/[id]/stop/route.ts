import { getProject, notFoundResponse } from "@/lib/access";

export const dynamic = "force-dynamic";

/**
 * Stop the current turn from any tab, even one that didn't start it. The
 * running agent checks for "stopped" before each step and wraps up; if its
 * invocation is already gone, the project simply becomes ready again.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const res = await getProject(params.id);
  if (!res.ok) return notFoundResponse();
  if (!["running", "paused"].includes(res.project.status)) return Response.json({ ok: true });
  const { error } = await res.admin.from("projects").update({ status: "stopped", updated_at: new Date().toISOString() }).eq("id", params.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
