import type { StoredEvent, StoredMessage } from "@/lib/projectData";
import type { ThreadItem } from "@/lib/workspaceTypes";

const VERB: Record<string, [string, string]> = {
  web_search: ["Searched", "Searching"],
  web_fetch: ["Read", "Reading"],
  write_file: ["Wrote", "Writing"],
  str_replace: ["Edited", "Editing"],
  read_file: ["Read", "Reading"],
};
const STEP_VERB: Record<string, [string, string]> = {
  plan: ["Planned", "Planning"],
  check: ["Checked", "Checking"],
  verify: ["Verified", "Verifying"],
};

const host = (u: string) => {
  try {
    return u.replace(/^https?:\/\//, "").split("/")[0];
  } catch {
    return u;
  }
};

type ToolItem = Extract<ThreadItem, { type: "tool" }>;

/**
 * Turns the persisted (and, mid-run, live-appended) events + user messages
 * into the rows the chat thread renders. tool-call/tool-result pairs merge
 * into one row keyed by their shared callId; "say" events are the
 * orchestrator's narration, already complete text (see lib/orchestrator.ts).
 */
export function buildThread(events: StoredEvent[], messages: StoredMessage[]): ThreadItem[] {
  const rows: { ts: string; kind: "msg" | "evt"; data: StoredMessage | StoredEvent }[] = [
    ...messages.filter((m) => m.role === "user").map((m) => ({ ts: m.created_at, kind: "msg" as const, data: m })),
    ...events.map((e) => ({ ts: e.created_at, kind: "evt" as const, data: e })),
  ].sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));

  const items: ThreadItem[] = [];
  const toolIndex = new Map<string, number>();

  for (const r of rows) {
    if (r.kind === "msg") {
      const m = r.data as StoredMessage;
      const match = /^\[([^\]]+)\]\s([\s\S]*)$/.exec(m.content);
      items.push({ key: "m" + m.id, type: "user", text: match ? match[2] : m.content, tag: match?.[1] });
      continue;
    }

    const e = r.data as StoredEvent;
    const p = (e.payload ?? {}) as Record<string, any>;

    if (e.type === "say") {
      const text = String(p.text ?? "");
      items.push({ key: "e" + e.id, type: "text", text, shown: text, caret: false });
    } else if (e.type === "error") {
      items.push({ key: "e" + e.id, type: "error", text: String(p.message ?? "Something went wrong") });
    } else if (e.type === "step") {
      const v = STEP_VERB[p.kind] ?? ["Done", "Working"];
      items.push({
        key: "e" + e.id,
        type: "tool",
        verb: v[0],
        active: false,
        detail: String(p.detail ?? ""),
        meta: "",
        rows: (p.rows ?? []).map((row: any) => ({ k: String(row.k), t: String(row.t), d: String(row.d ?? "") })),
      });
    } else if (e.type === "tool-call") {
      const callId = String(p.callId ?? e.id);
      const v = VERB[p.name] ?? [p.name, p.name];
      const detail =
        p.name === "web_search"
          ? String(p.args?.query ?? "")
          : p.name === "web_fetch"
            ? String(p.args?.source_id ?? "")
            : String(p.args?.path ?? "");
      toolIndex.set(callId, items.length);
      items.push({ key: "c" + callId, type: "tool", verb: v[1], active: true, detail, meta: "", rows: [] });
    } else if (e.type === "tool-result") {
      const callId = String(p.callId ?? "");
      const name = String(p.name ?? "");
      const v = VERB[name] ?? [name, name];
      let detail: string | undefined;
      let meta = "";
      let rows: { k: string; t: string; d: string }[] = [];

      if (name === "web_search") {
        const results = (p.results ?? []) as { id: string; title: string; url: string }[];
        meta = `${results.length} result${results.length === 1 ? "" : "s"}`;
        rows = results.map((s) => ({ k: s.id, t: s.title, d: host(s.url) }));
      } else if (name === "web_fetch") {
        const s = p.source as { id: string; title: string; url: string } | undefined;
        if (s) {
          detail = s.title;
          meta = host(s.url);
          rows = [{ k: s.id, t: s.title, d: host(s.url) }];
        }
      } else if (name === "write_file" || name === "str_replace") {
        meta = p.version ? "v" + p.version : "";
      }
      if (p.error) meta = "error";

      const idx = toolIndex.get(callId);
      if (idx != null && items[idx]?.type === "tool") {
        const cur = items[idx] as ToolItem;
        items[idx] = { ...cur, verb: v[0], active: false, meta, rows: rows.length ? rows : cur.rows, detail: detail ?? cur.detail };
      } else {
        items.push({ key: "r" + e.id, type: "tool", verb: v[0], active: false, detail: detail ?? "", meta, rows });
      }
    }
    // "phase", "done" and "token" events don't render as their own rows.
  }
  return items;
}
