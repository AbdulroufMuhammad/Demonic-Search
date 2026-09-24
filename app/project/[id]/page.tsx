import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadProjectData } from "@/lib/projectData";
import Workspace from "@/components/Workspace";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const admin = createAdminClient();
  const { data: project } = await admin.from("projects").select("*").eq("id", params.id).single();
  if (!project) notFound();

  const data = await loadProjectData(admin, project);
  return <Workspace initial={data} />;
}
