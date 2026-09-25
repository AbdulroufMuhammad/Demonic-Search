import type { SupabaseClient } from "@supabase/supabase-js";

export type FileEntry = { path: string; version: number; url: string };
export type StoredEvent = { id: string; role: string | null; type: string; payload: any; created_at: string };
export type StoredMessage = { id: string; role: string; content: string; created_at: string };

export type BoardData = {
  facets: { id: string; question: string }[];
  sources: { id: string; title: string; url: string; facetId: string | null }[];
  claims: {
    id: string;
    text: string;
    quote: string;
    sourceIds: string[];
    confidence: number | null;
    ok: boolean | null;
    facetId: string | null;
  }[];
  gaps: { id: string; facetId: string | null; question: string; priority: string; resolved: boolean }[];
  budget: { tokensLeft: number; searchesLeft: number } | null;
};

export type ProjectData = {
  project: {
    id: string;
    title: string;
    goal: string;
    template: string;
    status: string;
    share_access: string;
    updated_at: string;
  };
  files: FileEntry[];
  events: StoredEvent[];
  messages: StoredMessage[];
  board: BoardData;
};

export async function loadBoard(db: SupabaseClient, projectId: string, plan?: any, budget?: any): Promise<BoardData> {
  const [{ data: sources }, { data: claims }, { data: gaps }] = await Promise.all([
    db.from("sources").select("short_id, url, title, facet_id").eq("project_id", projectId).order("created_at"),
    db.from("claims").select("id, text, quote, source_ids, confidence, ok, facet_id").eq("project_id", projectId).order("created_at"),
    db.from("gaps").select("id, facet_id, question, priority, resolved").eq("project_id", projectId).order("created_at"),
  ]);
  return {
    facets: plan?.facets ?? [],
    sources: (sources ?? [])
      .map((s) => ({ id: s.short_id, title: s.title ?? s.url, url: s.url, facetId: s.facet_id ?? null }))
      .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1))),
    claims: (claims ?? []).map((c) => ({
      id: c.id,
      text: c.text,
      quote: c.quote ?? "",
      sourceIds: c.source_ids ?? [],
      confidence: c.confidence == null ? null : Number(c.confidence),
      ok: c.ok,
      facetId: c.facet_id ?? null,
    })),
    gaps: (gaps ?? []).map((g) => ({
      id: g.id,
      facetId: g.facet_id ?? null,
      question: g.question,
      priority: g.priority,
      resolved: g.resolved,
    })),
    budget: budget ? { tokensLeft: budget.tokensLeft, searchesLeft: budget.searchesLeft } : null,
  };
}

export async function latestFiles(db: SupabaseClient, projectId: string): Promise<FileEntry[]> {
  const { data: files } = await db
    .from("files")
    .select("path, version, storage_path")
    .eq("project_id", projectId)
    .order("version", { ascending: false });
  const latest = new Map<string, FileEntry>();
  for (const f of files ?? [])
    if (!latest.has(f.path))
      latest.set(f.path, {
        path: f.path,
        version: f.version,
        url: db.storage.from("artifacts").getPublicUrl(f.storage_path).data.publicUrl,
      });
  return [...latest.values()];
}

/** Everything the workspace needs to rebuild the chat thread, board and canvas. */
export async function loadProjectData(db: SupabaseClient, project: any): Promise<ProjectData> {
  const [files, { data: events }, { data: messages }, board] = await Promise.all([
    latestFiles(db, project.id),
    db
      .from("events")
      .select("id, role, type, payload, created_at")
      .eq("project_id", project.id)
      .neq("type", "token")
      .order("created_at"),
    db.from("messages").select("id, role, content, created_at").eq("project_id", project.id).order("created_at"),
    loadBoard(db, project.id, project.plan, project.budget),
  ]);
  return {
    project: {
      id: project.id,
      title: project.title,
      goal: project.goal ?? project.title,
      template: project.template,
      status: project.status,
      share_access: project.share_access ?? "private",
      updated_at: project.updated_at,
    },
    files,
    events: events ?? [],
    messages: messages ?? [],
    board,
  };
}

export async function readArtifact(db: SupabaseClient, projectId: string, path = "index.html") {
  const { data: file } = await db
    .from("files")
    .select("storage_path, version")
    .eq("project_id", projectId)
    .eq("path", path)
    .order("version", { ascending: false })
    .limit(1)
    .single();
  if (!file) return null;
  const { data: blob } = await db.storage.from("artifacts").download(file.storage_path);
  if (!blob) return null;
  return { content: await blob.text(), version: file.version as number };
}
