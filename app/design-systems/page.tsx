import { createAdminClient } from "@/lib/supabase/admin";
import Sidebar from "@/components/Sidebar";
import DesignSystemsClient from "@/components/DesignSystemsClient";
import { DEFAULT_DS, fromRow } from "@/lib/designSystems";

// No per-request auth call remains to force dynamic rendering, and this
// page must never be frozen at build time (it lists live projects/systems),
// nor served from a cached fetch — see the matching note on app/page.tsx.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function DesignSystemsPage() {
  const admin = createAdminClient();
  const [{ data: projects }, { data: dsRows }] = await Promise.all([
    admin.from("projects").select("id, title").order("updated_at", { ascending: false }).limit(6),
    admin
      .from("design_systems")
      .select("*")
      .order("owner_id", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true }),
  ]);
  const systems = [DEFAULT_DS, ...(dsRows ?? []).map(fromRow)];

  return (
    <div className="app-shell">
      <Sidebar active="ds" recent={projects ?? []} />
      <main className="ds-main">
        <DesignSystemsClient initialSystems={systems} />
      </main>
    </div>
  );
}
