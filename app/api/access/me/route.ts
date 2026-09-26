import { currentSession } from "@/lib/accessServer";

export const dynamic = "force-dynamic";

/** Which kind of key this browser is signed in with (the header shows key management for the main key). */
export async function GET() {
  const s = await currentSession();
  return Response.json({ kind: s?.kind ?? null, expires: s?.kind === "temp" ? new Date(s.exp).toISOString() : null });
}
