import AccessForm from "@/components/access/AccessForm";
import { accessConfigured } from "@/lib/accessKeys";

export const dynamic = "force-dynamic";

/** Where anyone without a valid access key lands. */
export default function AccessPage({ searchParams }: { searchParams: { next?: string } }) {
  const next = typeof searchParams.next === "string" && searchParams.next.startsWith("/") && !searchParams.next.startsWith("//") ? searchParams.next : "/";
  return <AccessForm next={next} configured={accessConfigured()} />;
}
