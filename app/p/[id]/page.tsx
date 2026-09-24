import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBoard, readArtifact } from "@/lib/projectData";
import PublicReport from "@/components/PublicReport";

/**
 * The public share link. Unlike /project/[id], this never requires sign-in —
 * "Anyone with the link can view" is the point — so it's gated purely on
 * share_access (checked here, not by RLS) via the admin client.
 */
export default async function PublicProjectPage({ params }: { params: { id: string } }) {
  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("id, owner_id, title, status, share_access")
    .eq("id", params.id)
    .single();
  if (!project) notFound();

  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user?.id === project.owner_id) redirect(`/project/${params.id}`);
  if (project.share_access === "private") notFound();

  const [board, artifact] = await Promise.all([loadBoard(admin, params.id), readArtifact(admin, params.id)]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--ink)" }}>
      <div className="canvas-toolbar" style={{ position: "sticky", top: 0, zIndex: 2 }}>
        <div className="canvas-toolbar-left">
          <Link href="/" className="sidebar-brand" style={{ padding: 0 }}>
            <span className="brand-mark">D</span>
            <span className="brand-name">Demonic Search</span>
          </Link>
          <span className="file-label">{project.title}</span>
        </div>
        <div className="canvas-toolbar-right">
          <span className="file-label">{project.share_access === "edit" ? "Anyone with the link can edit" : "Anyone with the link can view"}</span>
        </div>
      </div>
      {project.status === "ready" && artifact ? (
        <PublicReport html={artifact.content} board={board} />
      ) : (
        <p style={{ textAlign: "center", color: "var(--muted)", padding: "80px 20px" }}>
          This project doesn&rsquo;t have a finished report yet.
        </p>
      )}
    </div>
  );
}
