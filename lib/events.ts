import type { SupabaseClient } from "@supabase/supabase-js";

export type AgentEvent = {
  role?: string;
  type: "token" | "phase" | "tool-call" | "tool-result" | "error" | "done";
  payload: Record<string, unknown>;
};

/**
 * Append-only event log, persisted to Supabase and streamed live.
 * Token deltas are high-frequency (hundreds per model call) and only matter
 * for the live UI, so they're forwarded to the stream but never written to
 * the DB — persisting one row per token was adding enough latency/load to
 * meaningfully eat into the run's time budget.
 */
export function makeEmitter(
  db: SupabaseClient,
  projectId: string,
  onEvent?: (e: AgentEvent) => void
) {
  return async function emit(e: AgentEvent) {
    onEvent?.(e);
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
