import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const [{ data: project, error }, { data: messages }, { data: files }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", params.id).single(),
    supabase.from("messages").select("*").eq("project_id", params.id).order("created_at"),
    supabase
      .from("files")
      .select("path, version, storage_path, content_type, created_at")
      .eq("project_id", params.id)
      .order("version", { ascending: false }),
  ]);
  if (error || !project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const latestByPath = new Map<string, (typeof files extends (infer U)[] | null ? U : never)>();
  for (const f of files ?? []) if (!latestByPath.has(f.path)) latestByPath.set(f.path, f);

  return NextResponse.json({
    project,
    messages,
    files: [...latestByPath.values()].map((f) => ({
      ...f,
      url: supabase.storage.from("artifacts").getPublicUrl(f.storage_path).data.publicUrl,
    })),
  });
}
