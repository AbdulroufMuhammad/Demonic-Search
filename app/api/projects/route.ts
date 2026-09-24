import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Auth is disabled for now (single-user/dev mode) — every request runs
// through the service-role client instead of a signed-in session.
export async function GET(req: Request) {
  const supabase = createAdminClient();

  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor");
  let query = supabase
    .from("projects")
    .select("id, title, template, status, updated_at, thumbnail_path")
    .order("updated_at", { ascending: false })
    .limit(20);
  if (cursor) query = query.lt("updated_at", cursor);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ projects: data });
}

export async function POST(req: Request) {
  const supabase = createAdminClient();

  const body = await req.json();
  const { prompt, template = "blank", model_profile = "quality", design_system_id = null } = body;
  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      title: prompt.slice(0, 80),
      template,
      model_profile,
      design_system_id,
      goal: prompt,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("messages").insert({ project_id: project.id, role: "user", content: prompt });

  return NextResponse.json({ project });
}
