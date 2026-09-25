import type { SupabaseClient } from "@supabase/supabase-js";

export type AgentEvent = {
  role?: string;
  /**
   * token/phase/tool-call/tool-result/error/done come from the agent loop.
   * "say" is orchestrator narration shown as assistant text in the chat;
   * "step" is a summarised pipeline step (plan, citation check, verify).
   * "continue" means this invocation is pausing with real work still left
   * (see pause() in orchestrator.ts) — the client re-POSTs /run to resume.
   */
  type: "token" | "phase" | "tool-call" | "tool-result" | "error" | "done" | "say" | "step" | "continue";
  payload: Record<string, unknown>;
};

/** Append-only event log, persisted to Supabase and optionally streamed live. */
export function makeEmitter(
  db: SupabaseClient,
  projectId: string,
  onEvent?: (e: AgentEvent) => void
) {
  return async function emit(e: AgentEvent) {
    onEvent?.(e);
    // Tokens are only useful live; persisting one row per token floods the table.
    if (e.type === "token") return;
    await db.from("events").insert({
      project_id: projectId,
      role: e.role ?? null,
      type: e.type,
      payload: e.payload,
    });
  };
}

export type Emit = ReturnType<typeof makeEmitter>;
