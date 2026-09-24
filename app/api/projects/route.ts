import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const admin = createAdminClient();
  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor");
  let query = admin
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
  const admin = createAdminClient();
  const body = await req.json();
  const { prompt, template = "blank", model_profile = "quality" } = body;
  // "default" is the built-in house style, which is not a stored row.
  const design_system_id =
    typeof body.design_system_id === "string" && body.design_system_id && body.design_system_id !== "default"
      ? body.design_system_id
      : null;
  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const { data: project, error } = await admin
    .from("projects")
    .insert({
      title: prompt.split(/[:\n]/)[0].trim().slice(0, 80) || prompt.slice(0, 80),
      template,
      model_profile,
      design_system_id,
      goal: prompt,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("messages").insert({ project_id: project.id, role: "user", content: prompt });

  return NextResponse.json({ project });
}
