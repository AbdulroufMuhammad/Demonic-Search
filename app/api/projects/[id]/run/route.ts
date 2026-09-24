import { createAdminClient } from "@/lib/supabase/admin";
import { runProject } from "@/lib/orchestrator";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const admin = createAdminClient();
  const { data: project } = await admin.from("projects").select("id").eq("id", params.id).single();
  if (!project) return new Response("not found", { status: 404 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      try {
        await runProject(admin, params.id, (e) => send(e));
        send({ type: "stream-end" });
      } catch (e) {
        send({ type: "error", payload: { message: e instanceof Error ? e.message : String(e) } });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
