import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import Workspace from "@/components/Workspace";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const supabase = createAdminClient();

  const { data: project } = await supabase.from("projects").select("*").eq("id", params.id).single();
  if (!project) notFound();

  const { data: files } = await supabase
    .from("files")
    .select("path, version, storage_path")
    .eq("project_id", params.id)
    .order("version", { ascending: false });

  const latestByPath = new Map<string, { path: string; version: number; storage_path: string }>();
  for (const f of files ?? []) if (!latestByPath.has(f.path)) latestByPath.set(f.path, f);

  const resolvedFiles = [...latestByPath.values()].map((f) => ({
    path: f.path,
    version: f.version,
    url: supabase.storage.from("artifacts").getPublicUrl(f.storage_path).data.publicUrl,
  }));

  return (
    <Workspace
      projectId={project.id}
      goal={project.goal ?? project.title}
      status={project.status}
      initialFiles={resolvedFiles}
    />
  );
}
