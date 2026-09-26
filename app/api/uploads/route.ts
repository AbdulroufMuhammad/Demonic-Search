import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET } from "@/lib/tools/files";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const MAX_BYTES = 4 * 1024 * 1024;

/** Image attachments (already downscaled in the browser), stored publicly so designs can use them. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const m = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(body.dataUrl ?? ""));
  if (!m || !TYPES[m[1]]) return Response.json({ error: "Only PNG, JPEG, WebP or GIF images can be attached" }, { status: 400 });
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length > MAX_BYTES) return Response.json({ error: "That image is too large (max 4 MB)" }, { status: 413 });

  const db = createAdminClient();
  const key = `uploads/${randomUUID()}.${TYPES[m[1]]}`;
  const { error } = await db.storage.from(BUCKET).upload(key, new Blob([new Uint8Array(bytes)], { type: m[1] }), { contentType: m[1] });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const name = String(body.name ?? "image").replace(/[^\p{L}\p{N} ._()-]/gu, "").slice(0, 120) || "image";
  return Response.json({ name, url: db.storage.from(BUCKET).getPublicUrl(key).data.publicUrl });
}
