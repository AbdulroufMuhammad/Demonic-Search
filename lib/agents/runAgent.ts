import { chat, type ChatMessage } from "@/lib/gateway";
import { Board, BudgetExceeded } from "@/lib/board";
import type { SupabaseClient } from "@supabase/supabase-js";
import { webSearch, webFetch } from "@/lib/tools/tavily";
import { makeFileTools } from "@/lib/tools/files";
import { ROLES, type RoleName } from "@/lib/agents/roles";
import type { Template } from "@/lib/templates";
import type { Emit } from "@/lib/events";

type Tool = (args: any, board: Board) => Promise<unknown>;

function buildToolRegistry(db: SupabaseClient, board: Board): Record<string, Tool> {
  const files = makeFileTools(db, board.projectId);
  return {
    web_search: (args) => webSearch(board, args),
    web_fetch: (args) => webFetch(board, args),
    write_file: (args) => files.write_file(args),
    str_replace: (args) => files.str_replace(args),
    read_file: (args) => files.read_file(args),
  };
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
  emit: Emit
): Promise<any> {
  const cfg = ROLES[role];
  const tools = buildToolRegistry(db, board);
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

    for (const tc of r.toolCalls) {
      let result: unknown;
      try {
        const args = JSON.parse(tc.args || "{}");
        const fn = tools[tc.name];
        if (!fn) throw new Error(`unknown tool: ${tc.name}`);
        await emit({ role, type: "tool-call", payload: { name: tc.name, args } });
        result = await fn(args, board);
        await emit({ role, type: "tool-result", payload: { name: tc.name } });
      } catch (e) {
        if (e instanceof BudgetExceeded) throw e;
        result = { error: e instanceof Error ? e.message : String(e) };
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
