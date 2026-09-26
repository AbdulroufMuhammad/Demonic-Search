import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET } from "@/lib/tools/files";
import { modelKeyFor, type ModelKey } from "@/lib/gateway";

export type FileVersion = { version: number; created_at: string };
export type FileEntry = { path: string; version: number; url: string; updated_at: string; versions: FileVersion[] };
export type StoredEvent = { id: string; type: string; payload: any; created_at: string };
export type StoredMessage = { id: string; role: string; content: string; meta: any; created_at: string };
export type SourceEntry = { id: string; title: string; url: string };

export type ProjectInfo = {
  id: string;
  title: string;
  template: string;
  status: string;
  model: ModelKey;
  design_system_id: string | null;
  design_systems: string[];
  codebase: string | null;
  updated_at: string;
};

export type ProjectData = {
  project: ProjectInfo;
  files: FileEntry[];
  events: StoredEvent[];
  messages: StoredMessage[];
  sources: SourceEntry[];
};

/** A running turn heartbeats at least every ~15s; this long without one means its invocation died. */
export const STALE_RUN_MS = 45_000;
/** Paused or dead turns are only resumed automatically within this window; older ones just show as ready. */
export const RESUME_WINDOW_MS = 30 * 60_000;

/** The status to act on: dead "running" turns become resumable "paused", and old or stopped ones "ready". */
export function effectiveStatus(p: { status: string; updated_at: string }) {
  const age = Date.now() - new Date(p.updated_at).getTime();
  if (p.status === "stopped") return "ready";
  if (p.status === "running" && age > STALE_RUN_MS) return age > RESUME_WINDOW_MS ? "ready" : "paused";
  if (p.status === "paused" && age > RESUME_WINDOW_MS) return "ready";
  return p.status;
}

export function projectInfo(p: any): ProjectInfo {
  return {
    id: p.id,
    title: p.title,
    template: p.template,
    status: effectiveStatus(p),
    model: modelKeyFor(p.model_profile),
    design_system_id: p.design_system_id ?? null,
    design_systems: Array.isArray(p.settings?.designSystems) ? p.settings.designSystems : [],
    codebase: p.codebase ?? null,
    updated_at: p.updated_at,
  };
}

export async function listFiles(db: SupabaseClient, projectId: string): Promise<FileEntry[]> {
  const { data } = await db
    .from("files")
    .select("path, version, storage_path, created_at")
    .eq("project_id", projectId)
    .order("version", { ascending: false });
  const byPath = new Map<string, FileEntry>();
  for (const f of data ?? []) {
    let entry = byPath.get(f.path);
    if (!entry) {
      entry = {
        path: f.path,
        version: f.version,
        url: db.storage.from(BUCKET).getPublicUrl(f.storage_path).data.publicUrl,
        updated_at: f.created_at,
        versions: [],
      };
      byPath.set(f.path, entry);
    }
    entry.versions.push({ version: f.version, created_at: f.created_at });
  }
  return [...byPath.values()].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
}

export async function loadProjectData(db: SupabaseClient, project: any): Promise<ProjectData> {
  const [files, { data: events }, { data: messages }, { data: sources }] = await Promise.all([
    listFiles(db, project.id),
    db.from("events").select("id, type, payload, created_at").eq("project_id", project.id).order("created_at"),
    db.from("messages").select("id, role, content, meta, created_at").eq("project_id", project.id).order("created_at"),
    db.from("sources").select("short_id, url, title").eq("project_id", project.id),
  ]);
  return {
    project: projectInfo(project),
    files,
    events: events ?? [],
    messages: messages ?? [],
    sources: (sources ?? []).map((s) => ({ id: s.short_id, title: s.title ?? s.url, url: s.url })),
  };
}

export async function readFile(db: SupabaseClient, projectId: string, path: string, version?: number) {
  let q = db.from("files").select("storage_path, version").eq("project_id", projectId).eq("path", path);
  q = version ? q.eq("version", version) : q.order("version", { ascending: false });
  const { data } = await q.limit(1);
  const row = data?.[0];
  if (!row) return null;
  const { data: blob } = await db.storage.from(BUCKET).download(row.storage_path);
  if (!blob) return null;
  return { path, content: await blob.text(), version: row.version as number };
}
