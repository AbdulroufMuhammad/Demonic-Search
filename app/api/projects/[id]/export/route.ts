import { getProject, notFoundResponse } from "@/lib/access";
import { readFile } from "@/lib/projectData";

export const dynamic = "force-dynamic";

/** Standalone HTML download. PDF export happens in the browser (print dialog), see lib/print.ts. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const res = await getProject(params.id);
  if (!res.ok) return notFoundResponse();
  const path = new URL(req.url).searchParams.get("path") ?? "";
  const file = await readFile(res.admin, params.id, path);
  if (!file) return Response.json({ error: "file not found" }, { status: 404 });
  const name = file.path.replace(/["\\\r\n]/g, "");
  return new Response(file.content, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}
