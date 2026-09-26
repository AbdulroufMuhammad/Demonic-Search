import { listRepos } from "@/lib/tools/github";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ repos: await listRepos() });
  } catch (e) {
    return Response.json({ repos: [], error: e instanceof Error ? e.message : String(e) });
  }
}
