import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBoard, readArtifact } from "@/lib/projectData";
import PublicReport from "@/components/PublicReport";

/**
 * A clean, read-only view of a report — no chat/board/inspect chrome — for
 * sharing or embedding a link to just the artifact. There are no accounts,
 * so the full interactive workspace at /project/[id] is equally open to
 * anyone with that URL; this page exists for a nicer reading link, not for
 * access control.
 */
export const dynamic = "force-dynamic";

export default async function PublicProjectPage({ params }: { params: { id: string } }) {
  const admin = createAdminClient();
  const { data: project } = await admin.from("projects").select("id, title, status").eq("id", params.id).single();
  if (!project) notFound();

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
          <Link href={`/project/${params.id}`} className="file-label">
            Open in workspace →
          </Link>
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
