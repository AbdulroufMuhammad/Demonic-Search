import { getProject, notFoundResponse } from "@/lib/access";
import { listFiles, readFile } from "@/lib/projectData";
import { cleanPath, makeFileTools } from "@/lib/tools/files";

export const dynamic = "force-dynamic";

/** A file's HTML (latest, or a specific version) for the canvas. Also read by view-only share links. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const res = await getProject(params.id);
  if (!res.ok) return notFoundResponse();
  const sp = new URL(req.url).searchParams;
  const path = sp.get("path") ?? "";
  const version = Number(sp.get("version")) || undefined;
  const file = await readFile(res.admin, params.id, path, version);
  if (!file) return Response.json({ error: "file not found" }, { status: 404 });
  return Response.json(file);
}

const BLANK_PAGE = (title: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title.replace(/</g, "&lt;")}</title>
<style>
  :root { --bg: #ffffff; --text: #1d1b18; }
  body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--text); font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
</style>
</head>
<body>
</body>
</html>`;

/** A new blank page ("Untitled", "Untitled 2", …) the user can then describe to the agent or edit. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const res = await getProject(params.id);
  if (!res.ok) return notFoundResponse();
  const body = await req.json().catch(() => ({}));
  const base = cleanPath(String(body?.name ?? "").trim() || "Untitled").replace(/\.html$/, "");
  const existing = new Set((await listFiles(res.admin, params.id)).map((f) => f.path));
  let path = `${base}.html`;
  for (let i = 2; existing.has(path); i++) path = `${base} ${i}.html`;
  const w = await makeFileTools(res.admin, params.id).write_file({ path, content: BLANK_PAGE(path.replace(/\.html$/, "")) });
  return Response.json({ path: w.path, version: w.version });
}
