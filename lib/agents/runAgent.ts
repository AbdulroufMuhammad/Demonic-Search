import { chat, type ChatMessage } from "@/lib/gateway";
import { Board, BudgetExceeded } from "@/lib/board";
import type { SupabaseClient } from "@supabase/supabase-js";
import { webSearch, webFetch } from "@/lib/tools/tavily";
import { makeFileTools } from "@/lib/tools/files";
import { ROLES, type RoleName } from "@/lib/agents/roles";
import type { Template } from "@/lib/templates";
import type { Emit } from "@/lib/events";
import { finalizeArtifact } from "@/lib/report/finalize";

type Tool = (args: any, board: Board) => Promise<unknown>;
export type AgentContext = { facetId?: string };

export function artifactTransform(board: Board, template: Template) {
  return (_path: string, content: string) =>
    finalizeArtifact(content, {
      research: template.research,
      sources: board.sources,
      claims: board.claims,
      dropped: board.dropped,
      designSystem: board.designSystem,
    });
}

function buildToolRegistry(
  db: SupabaseClient,
  board: Board,
  template: Template,
  ctx: AgentContext
): Record<string, Tool> {
  const files = makeFileTools(db, board.projectId, artifactTransform(board, template));
  return {
    web_search: (args) => webSearch(board, args, ctx.facetId),
    web_fetch: (args) => webFetch(board, args),
    write_file: (args) => files.write_file(args),
    str_replace: (args) => files.str_replace(args),
    read_file: (args) => files.read_file(args),
  };
}

/** What the UI needs to render a finished tool call (titles/URLs are fine here; agents never see them). */
function summarize(name: string, args: any, result: any, board: Board) {
  const src = (id: string) => {
    const s = board.sources.get(id);
    return { id, title: s?.title ?? id, url: s?.url ?? "" };
  };
  const budget = { searchesLeft: board.budget.searchesLeft, tokensLeft: board.budget.tokensLeft };
  if (name === "web_search") return { ...budget, results: (result ?? []).map((r: any) => src(r.id)) };
  if (name === "web_fetch") return { ...budget, source: src(args.source_id) };
  if (result && typeof result === "object" && "version" in result) return { ...budget, path: result.path, version: result.version };
  return budget;
}

/**
 * One loop shared by every agent role (guide §8, step 2): call the model,
 * execute any tool calls, feed results back, repeat until the model stops
 * calling tools or the role's step budget is spent.
 */
export async function runAgent(
  db: SupabaseClient,
  role: RoleName,
  board: Board,
  template: Template,
  input: string,
  emit: Emit,
  ctx: AgentContext = {}
): Promise<any> {
  const cfg = ROLES[role];
  const tools = buildToolRegistry(db, board, template, ctx);
  const messages: ChatMessage[] = [
    { role: "system", content: cfg.systemPrompt(board, template) },
    { role: "user", content: input },
  ];

  let badCalls = 0;
  await emit({ role, type: "phase", payload: { status: "start" } });

  for (let step = 0; step < cfg.maxSteps; step++) {
    board.guard();

    const r = await chat(cfg.model, {
      messages,
      tools: cfg.tools.length ? cfg.tools : undefined,
      onToken: (t) => emit({ role, type: "token", payload: { t } }),
    });
    board.meter(r.usage);

    const assistant: ChatMessage = { role: "assistant", content: r.content || null };
    if (r.toolCalls.length) {
      assistant.tool_calls = r.toolCalls.map((tc) => ({
        id: tc.id || `call_${step}`,
        type: "function",
        function: { name: tc.name, arguments: tc.args },
      }));
    }
    messages.push(assistant);

    if (!r.toolCalls.length) {
      await emit({ role, type: "phase", payload: { status: "done" } });
      return cfg.parseResult(r.content);
    }

    for (const [i, tc] of r.toolCalls.entries()) {
      let result: unknown;
      const callId = `${role}-${ctx.facetId ?? "x"}-${step}-${i}-${tc.id || ""}`;
      try {
        const args = JSON.parse(tc.args || "{}");
        const fn = tools[tc.name];
        if (!fn) throw new Error(`unknown tool: ${tc.name}`);
        const shown = tc.name === "write_file" || tc.name === "str_replace" ? { path: args.path } : args;
        await emit({ role, type: "tool-call", payload: { name: tc.name, args: shown, callId, facetId: ctx.facetId } });
        result = await fn(args, board);
        await emit({
          role,
          type: "tool-result",
          payload: { name: tc.name, callId, ...summarize(tc.name, args, result, board) },
        });
      } catch (e) {
        if (e instanceof BudgetExceeded) throw e;
        result = { error: e instanceof Error ? e.message : String(e) };
        await emit({ role, type: "tool-result", payload: { name: tc.name, callId, error: (result as any).error } });
        badCalls++;
        if (badCalls > 2) {
          await emit({ role, type: "error", payload: { message: "too many bad tool calls" } });
          return cfg.fallback(board);
        }
      }
      messages.push({
        role: "tool",
        tool_call_id: tc.id || "",
        content: JSON.stringify(result),
      });
    }
  }

  await emit({ role, type: "phase", payload: { status: "fallback" } });
  return cfg.fallback(board);
}
