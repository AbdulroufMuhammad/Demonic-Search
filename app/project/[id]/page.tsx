import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadProjectData } from "@/lib/projectData";
import Workspace from "@/components/Workspace";

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const admin = createAdminClient();
  const { data: project } = await admin.from("projects").select("*").eq("id", params.id).single();
  if (!project) notFound();

  const isOwner = project.owner_id === auth.user.id;
  if (!isOwner) {
    // Anyone but the owner only gets the full workspace (chat/board/inspect)
    // on an "edit" share link; a "view" link goes to the read-only page instead.
    if (project.share_access === "view") redirect(`/p/${params.id}`);
    if (project.share_access !== "edit") notFound();
  }

  const data = await loadProjectData(admin, project);
  return <Workspace initial={data} isOwner={isOwner} />;
}
