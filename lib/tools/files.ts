import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "artifacts";

/**
 * Files tool: write/read artifact files. Content lives in Supabase Storage; the `files` table tracks versions.
 * `transform` runs on every HTML write (see lib/report/finalize.ts).
 */
export function makeFileTools(
  db: SupabaseClient,
  projectId: string,
  transform?: (path: string, content: string) => string
) {
  async function nextVersion(path: string) {
    const { data } = await db
      .from("files")
      .select("version")
      .eq("project_id", projectId)
      .eq("path", path)
      .order("version", { ascending: false })
      .limit(1);
    return (data?.[0]?.version ?? 0) + 1;
  }

  async function write_file({ path, content }: { path: string; content: string }) {
    if (transform && path.endsWith(".html")) content = transform(path, content);
    const version = await nextVersion(path);
    const key = `${projectId}/${version}/${path}`;
    const { error } = await db.storage
      .from(BUCKET)
      .upload(key, new Blob([content], { type: "text/html" }), {
        contentType: "text/html",
        upsert: true,
      });
    if (error) throw new Error(`storage upload failed: ${error.message}`);
    await db.from("files").insert({
      project_id: projectId,
      path,
      version,
      storage_path: key,
      content_type: "text/html",
    });
    const { data: pub } = db.storage.from(BUCKET).getPublicUrl(key);
    return { path, version, url: pub.publicUrl };
  }

  async function str_replace({
    path,
    old_str,
    new_str,
  }: {
    path: string;
    old_str: string;
    new_str: string;
  }) {
    const current = await read_file({ path });
    if (!current.content.includes(old_str)) {
      throw new Error("old_str not found in file — read the file again before editing");
    }
    const content = current.content.replace(old_str, new_str);
    return write_file({ path, content });
  }

  async function read_file({ path }: { path: string }) {
    const { data, error } = await db
      .from("files")
      .select("*")
      .eq("project_id", projectId)
      .eq("path", path)
      .order("version", { ascending: false })
      .limit(1)
      .single();
    if (error || !data) throw new Error(`file not found: ${path}`);
    const { data: blob, error: dlErr } = await db.storage.from(BUCKET).download(data.storage_path);
    if (dlErr || !blob) throw new Error(`storage download failed: ${dlErr?.message}`);
    const content = await blob.text();
    return { path, version: data.version, content };
  }

  return { write_file, str_replace, read_file };
}

export const FILE_TOOL_SCHEMAS = [
  {
    type: "function" as const,
    function: {
      name: "write_file",
      description: "Create or overwrite an artifact file (a full HTML document).",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "str_replace",
      description: "Replace an exact substring in an existing artifact file.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          old_str: { type: "string" },
          new_str: { type: "string" },
        },
        required: ["path", "old_str", "new_str"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_file",
      description: "Read the latest version of an artifact file.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },
];
