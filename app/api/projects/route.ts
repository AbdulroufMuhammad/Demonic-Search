import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MODELS } from "@/lib/gateway";
import { getTemplate } from "@/lib/templates";
import { REPO_RE } from "@/lib/tools/github";
import { cleanAttachments } from "@/lib/attachments";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && UUID.test(x)).slice(0, 4) : []);

export async function POST(req: Request) {
  const admin = createAdminClient();
  const body = await req.json().catch(() => ({}));
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return NextResponse.json({ error: "prompt is required" }, { status: 400 });

  const template = getTemplate(body.template).id;
  const model = typeof body.model === "string" && body.model in MODELS ? body.model : "glm";
  const design_system_id = typeof body.design_system_id === "string" && body.design_system_id ? body.design_system_id : null;
  const codebase = typeof body.codebase === "string" && REPO_RE.test(body.codebase) ? body.codebase : null;
  const firstLine = prompt.split(/\n/)[0].trim();
  const title = firstLine.length > 60 ? firstLine.slice(0, 57).replace(/\s+\S*$/, "") + "…" : firstLine;

  const { data: project, error } = await admin
    .from("projects")
    .insert({
      title: title || "Untitled",
      template,
      model_profile: model,
      design_system_id,
      codebase,
      goal: prompt,
      settings: { designSystems: idList(body.design_systems).filter((id) => id !== design_system_id) },
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const attachments = cleanAttachments(body.attachments);
  await admin.from("messages").insert({
    project_id: project.id,
    role: "user",
    content: prompt,
    meta: attachments.length ? { attachments } : {},
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({ project });
}
