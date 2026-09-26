import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadProjectData } from "@/lib/projectData";
import { fromRow } from "@/lib/designSystems";
import { MODEL_KEYS, MODELS } from "@/lib/gateway";
import ProjectView from "@/components/project/ProjectView";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const admin = createAdminClient();
  const { data: project } = await admin.from("projects").select("*").eq("id", params.id).single();
  if (!project) notFound();

  const [data, { data: dsRows }] = await Promise.all([
    loadProjectData(admin, project),
    admin.from("design_systems").select("*").order("owner_id", { ascending: true, nullsFirst: true }).order("created_at", { ascending: true }),
  ]);
  return (
    <ProjectView
      initial={data}
      systems={(dsRows ?? []).map(fromRow)}
      models={MODEL_KEYS.map((key) => ({ key, label: MODELS[key].label, note: MODELS[key].note }))}
    />
  );
}
