import type { SupabaseClient } from "@supabase/supabase-js";

export const BUCKET = "artifacts";

/** File names are what the user sees ("Landing Page.html"); always one flat, .html name. */
export function cleanPath(raw: string) {
  const base = String(raw ?? "")
    .split(/[\\/]/)
    .pop()!
    .replace(/[^\p{L}\p{N} ._()+-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  const name = base.replace(/\.html?$/i, "").trim() || "index";
  return `${name}.html`;
}

const storageKey = (projectId: string, version: number, path: string) =>
  `${projectId}/${version}/${path.replace(/[^A-Za-z0-9._-]+/g, "-")}`;

export type FileWrite = { path: string; version: number; url: string; created: boolean };

/**
 * Artifact files: bytes in Supabase Storage, one immutable object per
 * version, with the `files` table as the version index. `transform` runs on
 * every write (see lib/finalize.ts).
 */
export function makeFileTools(db: SupabaseClient, projectId: string, transform?: (content: string) => string) {
  async function latest(path: string) {
    const { data } = await db
      .from("files")
      .select("version, storage_path")
      .eq("project_id", projectId)
      .eq("path", path)
      .order("version", { ascending: false })
      .limit(1);
    return data?.[0] ?? null;
  }

  async function write_file({ path, content }: { path: string; content: string }): Promise<FileWrite> {
    if (/\.(js|mjs|css|json|ts|tsx|jsx)$/i.test(String(path ?? "").trim()))
      throw new Error("each design is one self-contained HTML file; put scripts and styles inline in it instead of separate files");
    path = cleanPath(path);
    if (typeof content !== "string" || !content.trim()) throw new Error("content is empty");
    if (transform) content = transform(content);
    const prev = await latest(path);
    const version = (prev?.version ?? 0) + 1;
    const key = storageKey(projectId, version, path);
    const { error } = await db.storage
      .from(BUCKET)
      .upload(key, new Blob([content], { type: "text/html" }), { contentType: "text/html; charset=utf-8", upsert: true });
    if (error) throw new Error(`storage upload failed: ${error.message}`);
    const { error: rowErr } = await db
      .from("files")
      .insert({ project_id: projectId, path, version, storage_path: key, content_type: "text/html" });
    if (rowErr) throw new Error(`saving file failed: ${rowErr.message}`);
    return { path, version, url: db.storage.from(BUCKET).getPublicUrl(key).data.publicUrl, created: !prev };
  }

  async function read_file({ path, version }: { path: string; version?: number }) {
    path = cleanPath(path);
    let q = db.from("files").select("version, storage_path").eq("project_id", projectId).eq("path", path);
    q = version ? q.eq("version", version) : q.order("version", { ascending: false });
    const { data } = await q.limit(1);
    const row = data?.[0];
    if (!row) throw new Error(`file not found: ${path}`);
    const { data: blob, error } = await db.storage.from(BUCKET).download(row.storage_path);
    if (error || !blob) throw new Error(`storage download failed: ${error?.message}`);
    return { path, version: row.version as number, content: await blob.text() };
  }

  async function str_replace({ path, old_str, new_str }: { path: string; old_str: string; new_str: string }) {
    const current = await read_file({ path });
    const at = current.content.indexOf(old_str);
    if (!old_str || at < 0) throw new Error("old_str not found in the file; read_file it again and copy the exact text");
    if (current.content.indexOf(old_str, at + old_str.length) >= 0) throw new Error("old_str appears more than once; include more surrounding text");
    const content = current.content.slice(0, at) + new_str + current.content.slice(at + old_str.length);
    return write_file({ path, content });
  }

  return { write_file, read_file, str_replace };
}

export const FILE_TOOL_SCHEMAS = [
  {
    type: "function" as const,
    function: {
      name: "write_file",
      description:
        'Create a design file or replace it entirely. One complete, self-contained HTML document per file. Use a short descriptive name like "Landing Page.html".',
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string", description: "The full HTML document" } },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "str_replace",
      description: "Replace one exact, unique substring in an existing file. Best for targeted edits.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, old_str: { type: "string" }, new_str: { type: "string" } },
        required: ["path", "old_str", "new_str"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_file",
      description: "Read the latest version of a file in this project.",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    },
  },
];
