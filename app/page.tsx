import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import Composer from "@/components/Composer";

export const dynamic = "force-dynamic";

// Auth is disabled for now (single-user/dev mode) — every request runs
// through the service-role client instead of a signed-in session.
export default async function HomePage() {
  const supabase = createAdminClient();

  const { data: projects } = await supabase
    .from("projects")
    .select("id, title, template, status, updated_at")
    .order("updated_at", { ascending: false })
    .limit(9);

  return (
    <div className="container">
      <div className="topbar">
        <div className="brand">
          Demonic Search
          <small>Research and artifact engine · Supabase</small>
        </div>
      </div>

      <h1 className="title">What should we create?</h1>
      <Composer />

      {!!projects?.length && (
        <div className="recent">
          <h3>Recent</h3>
          <div className="recent-grid">
            {projects.map((p) => (
              <Link key={p.id} href={`/project/${p.id}`} className="recent-card">
                <span className="kind">{p.template}</span>
                <strong>{p.title}</strong>
                <span className="meta">{p.status} · {new Date(p.updated_at).toLocaleString()}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
