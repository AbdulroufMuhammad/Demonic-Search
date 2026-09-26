import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { listFiles, readFile } from "@/lib/projectData";
import PublicView from "@/components/project/PublicView";

/** A clean, view-only page for one project's designs — no chat or editing chrome. */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function PublicProjectPage({ params, searchParams }: { params: { id: string }; searchParams: { file?: string } }) {
  const admin = createAdminClient();
  const { data: project } = await admin.from("projects").select("id, title").eq("id", params.id).single();
  if (!project) notFound();

  const files = await listFiles(admin, params.id);
  const path = files.find((f) => f.path === searchParams.file)?.path ?? files[0]?.path ?? null;
  const file = path ? await readFile(admin, params.id, path) : null;

  return <PublicView projectId={project.id} title={project.title} files={files.map((f) => f.path)} path={path} html={file?.content ?? null} />;
}
