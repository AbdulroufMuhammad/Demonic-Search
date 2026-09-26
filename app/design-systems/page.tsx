import { createAdminClient } from "@/lib/supabase/admin";
import { fromRow } from "@/lib/designSystems";
import DesignSystemsClient from "@/components/DesignSystemsClient";
import AppHeader from "@/components/ui/AppHeader";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function DesignSystemsPage({ searchParams }: { searchParams: { new?: string } }) {
  const admin = createAdminClient();
  const { data: dsRows } = await admin
    .from("design_systems")
    .select("*")
    .order("owner_id", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true });

  return (
    <div className="home">
      <AppHeader />
      <main className="ds-main">
        <DesignSystemsClient initialSystems={(dsRows ?? []).map(fromRow)} startNew={searchParams.new === "1"} />
      </main>
    </div>
  );
}
