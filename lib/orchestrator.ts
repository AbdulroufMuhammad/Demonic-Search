import pLimit from "p-limit";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Board } from "@/lib/board";
import { runAgent } from "@/lib/agents/runAgent";
import { verifyCitations } from "@/lib/citations";
import { getTemplate } from "@/lib/templates";
import { makeEmitter, type AgentEvent } from "@/lib/events";

// Kept small on purpose: each agent call to a reasoning model takes ~20-40s,
// and the whole run has to fit inside one Vercel function invocation
// (300s). One critique round and 3 facets keeps a typical run well under that.
const MAX_ROUNDS = 1;
const MAX_FACETS = 3;
const CONCURRENCY = 3;

/**
 * The collaboration algorithm (guide §5): Plan → fan out Researchers →
 * Critique → loop on high-priority gaps → Write → Verify. Deterministic
 * control flow around nondeterministic agent calls; termination lives here,
 * not in a prompt.
 */
export async function runResearch(
  db: SupabaseClient,
  projectId: string,
  onEvent?: (e: AgentEvent) => void
) {
  const board = await Board.load(db, projectId);
  const template = getTemplate(board.template);
  const emit = makeEmitter(db, projectId, onEvent);

  board.plan = await runAgent(db, "planner", board, template, board.goal, emit);
  await board.checkpoint();

  let queue = (board.plan?.facets ?? [])
    .slice(0, MAX_FACETS)
    .map((f: any) => ({ facetId: f.id, question: f.question }));
  const limit = pLimit(CONCURRENCY);

  for (let round = 0; round < MAX_ROUNDS && queue.length; round++) {
    board.guard();
    const results = await Promise.all(
      queue.map((q: any) =>
        limit(() =>
          runAgent(
            db,
            "researcher",
            board,
            template,
            `Facet: ${q.facetId}\nQuestion: ${q.question}`,
            emit
          )
        )
      )
    );
    for (const r of results) await board.mergeClaims(r?.claims ?? []);
    verifyCitations(board);
    await board.persistClaims();
    await board.checkpoint();

    const critique = await runAgent(
      db,
      "critic",
      board,
      template,
      `Goal: ${board.goal}\nOutline: ${JSON.stringify(board.plan?.outline)}\nClaims so far: ${JSON.stringify(
        board.claims.map((c) => c.text)
      )}`,
      emit
    );
    board.gaps = critique?.gaps ?? [];
    await board.persistGaps();
    queue = board.gaps.filter((g) => g.priority === "high").slice(0, 4).map((g) => ({
      facetId: g.facetId,
      question: g.question,
    }));
    if (board.budget.searchesLeft < queue.length * 3) break;
  }

  const writerInput = `Goal: ${board.goal}\nOutline: ${JSON.stringify(
    board.plan?.outline
  )}\nVerified claims (cite by sourceId): ${JSON.stringify(board.claims)}\nSources: ${JSON.stringify(
    Object.fromEntries(board.sources)
  )}`;
  await runAgent(db, "writer", board, template, writerInput, emit);

  const report = await runAgent(
    db,
    "verifier",
    board,
    template,
    "Verify index.html.",
    emit
  );
  if (report?.issues?.length) {
    await runAgent(
      db,
      "writer",
      board,
      template,
      `Fix these issues in index.html: ${JSON.stringify(report.issues)}`,
      emit
    );
  }

  await emit({ type: "done", payload: {} });
  await db.from("projects").update({ status: "ready" }).eq("id", projectId);
  return board;
}

/** Non-research templates skip the search/critique loop: Writer, then Verifier once. */
export async function runDirect(
  db: SupabaseClient,
  projectId: string,
  onEvent?: (e: AgentEvent) => void
) {
  const board = await Board.load(db, projectId);
  const template = getTemplate(board.template);
  const emit = makeEmitter(db, projectId, onEvent);

  await runAgent(db, "writer", board, template, board.goal, emit);
  const report = await runAgent(db, "verifier", board, template, "Verify index.html.", emit);
  if (report?.issues?.length) {
    await runAgent(
      db,
      "writer",
      board,
      template,
      `Fix these issues in index.html: ${JSON.stringify(report.issues)}`,
      emit
    );
  }

  await emit({ type: "done", payload: {} });
  await db.from("projects").update({ status: "ready" }).eq("id", projectId);
  return board;
}

export async function runProject(db: SupabaseClient, projectId: string, onEvent?: (e: AgentEvent) => void) {
  const { data: project } = await db.from("projects").select("template").eq("id", projectId).single();
  const template = getTemplate(project?.template ?? "blank");
  await db.from("projects").update({ status: "running" }).eq("id", projectId);
  try {
    return template.research
      ? await runResearch(db, projectId, onEvent)
      : await runDirect(db, projectId, onEvent);
  } catch (e) {
    await db.from("projects").update({ status: "error" }).eq("id", projectId);
    throw e;
  }
}
