import { redirect } from "next/navigation";
import { requireMain } from "@/lib/accessServer";
import AppHeader from "@/components/ui/AppHeader";
import KeysClient from "@/components/access/KeysClient";

export const dynamic = "force-dynamic";

/** Temporary access keys: create with an expiry, see who's used them, revoke. Main key only. */
export default async function KeysPage() {
  if (!(await requireMain())) redirect("/access?next=/access/keys");
  return (
    <div className="home">
      <AppHeader />
      <KeysClient />
    </div>
  );
}
