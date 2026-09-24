import type { SupabaseClient } from "@supabase/supabase-js";

export type AgentEvent = {
  role?: string;
  type: "token" | "phase" | "tool-call" | "tool-result" | "error" | "done";
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
    await db.from("events").insert({
      project_id: projectId,
      role: e.role ?? null,
      type: e.type,
      payload: e.payload,
    });
  };
}

export type Emit = ReturnType<typeof makeEmitter>;
