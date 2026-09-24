import { createAdminClient } from "@/lib/supabase/admin";
import Sidebar from "@/components/Sidebar";
import Composer from "@/components/Composer";
import { getTemplate } from "@/lib/templates";
import { fromRow } from "@/lib/designSystems";
import { relativeTime } from "@/lib/relativeTime";

const STATUS_LABEL: Record<string, string> = {
  idle: "Not started",
  running: "Researching",
  ready: "Ready",
  error: "Error",
  needs_input: "Needs your input",
};
const statusColor = (s: string) =>
  s === "ready" || s === "needs_input" ? "var(--accent)" : s === "error" ? "var(--danger)" : "var(--muted)";

// Lists live projects/design systems — must never be frozen at build time.
export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: { ds?: string } }) {
  const admin = createAdminClient();
  const [{ data: projects }, { data: dsRows }] = await Promise.all([
    admin
      .from("projects")
      .select("id, title, template, status, updated_at")
      .order("updated_at", { ascending: false })
      .limit(12),
    admin
      .from("design_systems")
      .select("*")
      .order("owner_id", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true }),
  ]);
  const systems = (dsRows ?? []).map(fromRow);

  return (
    <div className="app-shell">
      <Sidebar active="home" recent={(projects ?? []).slice(0, 6).map((p) => ({ id: p.id, title: p.title }))} />
      <main className="home-main">
        <div className="home-col">
          <h1 className="home-h1">What should we find out?</h1>
          <Composer systems={systems} initialDsId={searchParams.ds ?? ""} />
        </div>

        {!!projects?.length && (
          <div className="home-col">
            <span className="section-label">Recent projects</span>
            <div className="recent-projects-grid">
              {projects.map((p) => {
                const t = getTemplate(p.template);
                return (
                  <a key={p.id} href={`/project/${p.id}`} className="project-card">
                    <div className="project-thumb">
                      <span className="kind">{t.label}</span>
                      <span className="headline">{p.title}</span>
                      <span className="bar" style={{ width: "90%" }} />
                      <span className="bar" style={{ width: "80%" }} />
                      <span className="bar" style={{ width: "86%" }} />
                    </div>
                    <div className="project-meta">
                      <span className="name">{p.title}</span>
                      <span className="status">
                        <span className="status-dot" style={{ background: statusColor(p.status) }} />
                        {STATUS_LABEL[p.status] ?? p.status} · {relativeTime(p.updated_at)}
                      </span>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
