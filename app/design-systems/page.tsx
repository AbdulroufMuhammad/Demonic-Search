import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import DesignSystemsClient from "@/components/DesignSystemsClient";
import { DEFAULT_DS, fromRow } from "@/lib/designSystems";

export default async function DesignSystemsPage() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const [{ data: projects }, { data: dsRows }] = await Promise.all([
    supabase.from("projects").select("id, title").order("updated_at", { ascending: false }).limit(6),
    supabase
      .from("design_systems")
      .select("*")
      .order("owner_id", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true }),
  ]);
  const systems = [DEFAULT_DS, ...(dsRows ?? []).map(fromRow)];

  return (
    <div className="app-shell">
      <Sidebar active="ds" email={auth.user.email ?? ""} recent={projects ?? []} />
      <main className="ds-main">
        <DesignSystemsClient initialSystems={systems} />
      </main>
    </div>
  );
}
