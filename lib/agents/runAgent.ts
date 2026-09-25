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
/**
 * `deadline` is the pipeline-wide wall-clock budget (epoch ms; see
 * lib/orchestrator.ts) — comfortably inside the route's 300s function
 * limit. A stalled call by itself can't run past it (lib/gateway.ts bounds
 * every attempt, including its own fallback-model retry, to whatever's left
 * of it), and the orchestrator checks the same clock before starting a new
 * phase at all, so a run that's genuinely going to overrun this invocation
 * pauses cleanly (status stays "running", a "continue" event fires) instead
 * of grinding out degraded fallbacks against a near-zero budget or getting
 * killed mid-call by the platform with nothing left to mark it failed.
 */
export type AgentContext = { facetId?: string; deadline?: number };

// Without a floor here, a stalled provider call would otherwise hang
// silently forever — no error, no event, nothing for the user to see —
// instead of failing visibly. The actual per-attempt cap (and the
// timeout -> fallback-model switch) lives in lib/gateway.ts, which every
// attempt shares `deadline` with. A role with no pipeline deadline (e.g. a
// chat edit, which isn't part of a budgeted run) still gets a reasonable
// default budget here so its calls stay bounded too.
const MIN_CALL_MS = 3_000;
const DEFAULT_CALL_BUDGET_MS = 90_000;

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
  await emit({ role, type: "phase", payload: { status: "start", facetId: ctx.facetId } });

  for (let step = 0; step < cfg.maxSteps; step++) {
    board.guardTokens();

    const remaining = ctx.deadline != null ? ctx.deadline - Date.now() : Infinity;
    if (remaining < MIN_CALL_MS) {
      // Not enough of the pipeline's wall-clock budget left to make this
      // call worth attempting — the platform would likely kill the whole
      // function mid-call anyway. Stop here rather than find out the hard
      // way (see the AgentContext note above).
      await emit({ role, type: "phase", payload: { status: "budget-exhausted", facetId: ctx.facetId } });
      return cfg.fallback(board);
    }
    const callDeadline = ctx.deadline ?? Date.now() + DEFAULT_CALL_BUDGET_MS;

    let r;
    try {
      r = await chat(cfg.model, {
        messages,
        tools: cfg.tools.length ? cfg.tools : undefined,
        onToken: (t) => emit({ role, type: "token", payload: { t, facetId: ctx.facetId } }),
        deadline: callDeadline,
      });
    } catch (e) {
      // A stalled/unresponsive provider call, even after gateway.ts's own
      // fallback-model retry — stop this agent here and hand back its
      // fallback rather than hanging the whole run, same spirit as the
      // BudgetExceeded handling below.
      const timedOut = (e as any)?.name === "TimeoutError";
      await emit({
        role,
        type: "error",
        payload: { message: timedOut ? "The model (and its fallback) didn't respond in time." : e instanceof Error ? e.message : String(e), facetId: ctx.facetId },
      });
      return cfg.fallback(board);
    }
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
      await emit({ role, type: "phase", payload: { status: "done", facetId: ctx.facetId } });
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
        if (e instanceof BudgetExceeded) {
          // The shared search budget ran out mid-call. Stop this agent here
          // and hand back whatever it already gathered rather than aborting
          // the whole run — other researchers' claims and the Writer/Verifier
          // still proceed.
          await emit({ role, type: "phase", payload: { status: "budget-exhausted", facetId: ctx.facetId } });
          return cfg.fallback(board);
        }
        result = { error: e instanceof Error ? e.message : String(e) };
        await emit({ role, type: "tool-result", payload: { name: tc.name, callId, error: (result as any).error } });
        badCalls++;
        if (badCalls > 2) {
          await emit({ role, type: "error", payload: { message: "too many bad tool calls", facetId: ctx.facetId } });
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

  await emit({ role, type: "phase", payload: { status: "fallback", facetId: ctx.facetId } });
  return cfg.fallback(board);
}
