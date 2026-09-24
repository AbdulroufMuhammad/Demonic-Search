import { createClient } from "@/lib/supabase/server";
import { fromRow } from "@/lib/designSystems";

export async function GET() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return Response.json({ error: "unauthenticated" }, { status: 401 });
  // RLS returns the seeded global systems (owner_id null) plus this user's own.
  // Seeded ones first, each group oldest-first so newly created systems land at the end.
  const { data, error } = await supabase
    .from("design_systems")
    .select("*")
    .order("owner_id", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ systems: (data ?? []).map(fromRow) });
}

const HEX = /^#[0-9a-f]{6}$/i;

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json();
  const name = String(body.name ?? "").trim() || "Untitled system";
  const colors = (Array.isArray(body.colors) ? body.colors : [])
    .filter((c: any) => HEX.test(c?.hex))
    .slice(0, 12)
    .map((c: any) => ({ name: String(c.name ?? "Color").slice(0, 40), hex: c.hex.toLowerCase() }));
  const fonts = (Array.isArray(body.fonts) ? body.fonts : [])
    .filter((f: any) => f?.stack)
    .slice(0, 4)
    .map((f: any) => ({ role: String(f.role ?? "Body").slice(0, 40), stack: String(f.stack).slice(0, 120) }));

  const { data, error } = await supabase
    .from("design_systems")
    .insert({
      owner_id: auth.user.id,
      name,
      tokens: {
        colors: colors.length ? colors : [
          { name: "Paper", hex: "#ffffff" },
          { name: "Ink", hex: "#1a1a1a" },
          { name: "Accent", hex: "#c8f542" },
        ],
        fonts: fonts.length ? fonts : [{ role: "Body", stack: "Geist, sans-serif" }],
      },
    })
    .select("*")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ system: fromRow(data) });
}
