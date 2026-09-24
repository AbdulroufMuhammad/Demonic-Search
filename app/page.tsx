import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Composer from "@/components/Composer";

export default async function HomePage() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

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
        <span style={{ color: "var(--muted)", fontSize: 13 }}>{auth.user.email}</span>
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
