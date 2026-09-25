import pLimit from "p-limit";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Board } from "@/lib/board";
import { runAgent } from "@/lib/agents/runAgent";
import { verifyCitations } from "@/lib/citations";
import { getTemplate, type Template } from "@/lib/templates";
import { makeEmitter, type AgentEvent, type Emit } from "@/lib/events";
import { chat } from "@/lib/gateway";

// Kept small on purpose: a live run against NVIDIA's API showed each
// reasoning-model call takes ~20-40s, and the whole run has to fit inside
// one Vercel function invocation (300s, see app/api/projects/[id]/run and
// .../chat). One critique round and 3 facets at a time keeps a typical run
// well under that; see the matching note on ROLES in lib/agents/roles.ts.
const MAX_ROUNDS = 1;
const MAX_FACETS = 3;
const CONCURRENCY = 3;

// The pipeline-wide wall-clock budget (see the note on AgentContext in
// lib/agents/runAgent.ts): comfortably under the route's 300s limit, leaving
// margin for DB writes and SSE flush after the last call returns.
const PIPELINE_DEADLINE_MS = 220_000;

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const say = (emit: Emit, text: string) => emit({ role: "orchestrator", type: "say", payload: { text } });

/** Has the Writer actually produced index.html at any point in this run? Decides ready vs. error below. */
async function hasArtifact(db: SupabaseClient, projectId: string) {
  const { count } = await db
    .from("files")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("path", "index.html");
  return !!count;
}

/**
 * The run's terminal status. An artifact existing is the bar for "ready" —
 * not just that every role finished — so a run that timed out with nothing
 * ever written lands on a visible, explicit "error" instead of a "Ready"
 * that opens onto an empty canvas.
 */
async function finish(db: SupabaseClient, projectId: string, emit: Emit, message: string) {
  const ok = await hasArtifact(db, projectId);
  await say(emit, message);
  await emit({ type: "done", payload: {} });
  await db
    .from("projects")
    .update({ status: ok ? "ready" : "error", updated_at: new Date().toISOString() })
    .eq("id", projectId);
}

function safeJson(content: string): any {
  const match = content.match(/\{[\s\S]*\}/);
  try {
    return JSON.parse(match ? match[0] : content);
  } catch {
    return null;
  }
}

/**
 * A cheap single-shot check before the real pipeline starts: is the goal
 * specific enough to act on, or too thin ("Hi", a bare greeting, no real
 * topic) to research/write without guessing? If it needs clarifying, asks
 * one question in chat and pauses the project at status "needs_input"
 * instead of burning the search/token budget on a guess. Runs once per
 * project — runProject skips it when resuming from needs_input. Fails open
 * (proceeds as if clear) on a gateway error, so a flaky check never blocks
 * a real run.
 */
async function checkClarify(db: SupabaseClient, projectId: string, goal: string, template: Template, emit: Emit): Promise<boolean> {
  // Visible immediately — otherwise the user sees nothing at all for
  // however long this call takes, which is exactly the "is it stuck?"
  // complaint this whole check exists to avoid causing.
  await emit({ role: "planner", type: "phase", payload: { status: "start" } });
  let parsed: any;
  try {
    const r = await chat("glm-flash", {
      messages: [
        {
          role: "system",
          content: `You are about to produce a ${template.label.toLowerCase()} from a user's request. Decide if the request gives you enough to act on, or if it's too thin to do anything with beyond guessing (a bare greeting, a single ambiguous word, no real subject at all). Be lenient — a short but specific topic is clear enough; only flag requests with no real content. Reply with ONLY JSON: {"clear":true} or {"clear":false,"question":"one short, specific question that would unblock it"}.`,
        },
        { role: "user", content: goal },
      ],
      onToken: (t) => emit({ role: "planner", type: "token", payload: { t } }),
      signal: AbortSignal.timeout(25_000),
    });
    parsed = safeJson(r.content);
  } catch {
    await emit({ role: "planner", type: "phase", payload: { status: "fallback" } });
    return false;
  }
  await emit({ role: "planner", type: "phase", payload: { status: "done" } });
  if (parsed?.clear === false && typeof parsed.question === "string" && parsed.question.trim()) {
    await say(emit, parsed.question.trim());
    await db.from("projects").update({ status: "needs_input", updated_at: new Date().toISOString() }).eq("id", projectId);
    await emit({ type: "done", payload: {} });
    return true;
  }
  return false;
}

/** User messages sent after the goal (e.g. while the run was going) become extra Writer instructions. */
async function queuedInstructions(db: SupabaseClient, projectId: string) {
  const { data } = await db
    .from("messages")
    .select("content")
    .eq("project_id", projectId)
    .eq("role", "user")
    .order("created_at");
  const extra = (data ?? []).slice(1).map((m) => m.content).filter(Boolean);
  return extra.length ? `\nExtra instructions from the user: ${JSON.stringify(extra)}` : "";
}

async function verify(db: SupabaseClient, board: Board, template: ReturnType<typeof getTemplate>, emit: Emit, deadline: number) {
  const report = await runAgent(db, "verifier", board, template, "Verify index.html.", emit, { deadline });
  const issues: string[] = report?.issues ?? [];
  await emit({
    role: "verifier",
    type: "step",
    payload: {
      kind: "verify",
      detail: issues.length ? `index.html · ${plural(issues.length, "issue")} found, fixing` : "index.html · 0 issues",
      rows: issues.map((t) => ({ k: "!", t, d: "" })),
    },
  });
  // Retrying the Writer only makes sense with real time left for it to run —
  // otherwise this is just another call guaranteed to hit runAgent's own
  // budget-exhausted skip, for no benefit over stopping here.
  if (issues.length && deadline - Date.now() > 10_000) {
    await runAgent(db, "writer", board, template, `Fix these issues in index.html: ${JSON.stringify(issues)}`, emit, { deadline });
  }
}

/**
 * The collaboration algorithm (guide §5): Plan → fan out Researchers →
 * Critique → loop on high-priority gaps → Write → Verify. Deterministic
 * control flow around nondeterministic agent calls; termination lives here,
 * not in a prompt. The "say" events narrate the run from real board state.
 */
export async function runResearch(
  db: SupabaseClient,
  projectId: string,
  onEvent?: (e: AgentEvent) => void,
  deadline: number = Date.now() + PIPELINE_DEADLINE_MS
) {
  const board = await Board.load(db, projectId);
  const template = getTemplate(board.template);
  const emit = makeEmitter(db, projectId, onEvent);

  board.plan = await runAgent(db, "planner", board, template, board.goal, emit, { deadline });
  await board.checkpoint();
  const facets = (board.plan?.facets ?? []).slice(0, MAX_FACETS);
  await say(
    emit,
    `I'll split this into ${plural(facets.length, "question")} and research them in parallel. A claim only makes it into the report if I can find its quote in the source page.`
  );
  await emit({
    role: "planner",
    type: "step",
    payload: {
      kind: "plan",
      detail: `${plural(facets.length, "research question")}`,
      rows: facets.map((f, i) => ({ k: `Q${i + 1}`, t: f.question, d: "" })),
    },
  });

  let queue = facets.map((f) => ({ facetId: f.id, question: f.question }));
  const limit = pLimit(CONCURRENCY);

  for (let round = 0; round < MAX_ROUNDS && queue.length; round++) {
    // Soft check, not board.guard(): running out of search budget (or wall-
    // clock budget) mid-run should stop starting new rounds, not abort the
    // whole run before the Writer ever sees the claims already gathered.
    if (board.budget.searchesLeft <= 0 || deadline - Date.now() < 15_000) break;
    await emit({
      role: "orchestrator",
      type: "phase",
      payload: { status: `round ${round + 1} · ${plural(queue.length, "researcher")}`, round: round + 1 },
    });
    const before = board.claims.length + board.dropped.length;
    const results = await Promise.all(
      queue.map((q) =>
        limit(() =>
          runAgent(db, "researcher", board, template, `Facet: ${q.facetId}\nQuestion: ${q.question}`, emit, {
            facetId: q.facetId,
            deadline,
          })
        )
      )
    );
    for (const r of results) await board.mergeClaims(r?.claims ?? []);
    const found = board.claims.length + board.dropped.length - before;
    await say(
      emit,
      round === 0
        ? `${plural(found, "claim")} so far across the ${plural(facets.length, "question")}. Checking every quote against the fetched page text.`
        : `${plural(found, "new claim")} from round ${round + 1}. Checking their quotes.`
    );

    const dropped = verifyCitations(board);
    await emit({
      role: "orchestrator",
      type: "step",
      payload: {
        kind: "check",
        detail: `${plural(found, "claim")} · ${found - dropped.length} verified · ${dropped.length} dropped`,
        rows: dropped.map((c) => ({ k: "✕", t: c.text, d: `not in ${c.sourceIds.join(", ")}` })),
      },
    });
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
      emit,
      { deadline }
    );
    board.gaps = critique?.gaps ?? [];
    await board.persistGaps();
    queue = board.gaps
      .filter((g) => g.priority === "high")
      .slice(0, 4)
      .map((g) => ({ facetId: g.facetId ?? facets[0]?.id ?? "f1", question: g.question }));
    const outOfBudget = board.budget.searchesLeft < queue.length * 3;
    const lastRound = round + 1 >= MAX_ROUNDS;

    if (queue.length && !outOfBudget && !lastRound) {
      await say(
        emit,
        `${queue.length === 1 ? "One gap matters" : `${queue.length} gaps matter`}: ${queue
          .map((q) => q.question)
          .join(" ")} I'm running another round before writing.`
      );
    } else {
      const open = board.gaps.map((g) => g.question);
      await say(
        emit,
        `${queue.length ? (outOfBudget ? "The search budget is nearly spent" : "That was the last research round") : "No high-priority gaps left"}.${
          open.length ? ` Still open: ${open.join(" ")} I'll flag it in the report.` : ""
        } Writing now.`
      );
      break;
    }
  }

  const writerInput = `Goal: ${board.goal}\nOutline: ${JSON.stringify(
    board.plan?.outline
  )}\nVerified claims (cite by sourceId): ${JSON.stringify(board.claims)}\nSources: ${JSON.stringify(
    Object.fromEntries([...board.sources].map(([id, s]) => [id, { title: s.title, url: s.url }]))
  )}\nOpen gaps: ${JSON.stringify(board.gaps.map((g) => g.question))}${await queuedInstructions(db, projectId)}`;
  await runAgent(db, "writer", board, template, writerInput, emit, { deadline });
  await verify(db, board, template, emit, deadline);

  const open = board.gaps[0]?.question;
  const ok = await hasArtifact(db, projectId);
  await finish(
    db,
    projectId,
    emit,
    ok
      ? `The report is on the canvas. ${plural(board.claims.length, "claim is", "claims are")} verified against their sources.${
          board.dropped.length
            ? ` I left out ${plural(board.dropped.length, "claim")} because the quote wasn't in the page.`
            : ""
        }${open ? ` Still unanswered: ${open}` : ""}`
      : "The models were too slow to finish writing the report in time. The research itself is saved — open the board to see what was found, and try again."
  );
  return board;
}

/** Non-research templates skip the search/critique loop: Writer, then Verifier once. */
export async function runDirect(
  db: SupabaseClient,
  projectId: string,
  onEvent?: (e: AgentEvent) => void,
  deadline: number = Date.now() + PIPELINE_DEADLINE_MS
) {
  const board = await Board.load(db, projectId);
  const template = getTemplate(board.template);
  const emit = makeEmitter(db, projectId, onEvent);

  await say(emit, `Writing a ${template.label.toLowerCase()} for this. I'll check the page renders before handing it over.`);
  const w = await runAgent(db, "writer", board, template, board.goal + (await queuedInstructions(db, projectId)), emit, { deadline });
  await verify(db, board, template, emit, deadline);

  const ok = await hasArtifact(db, projectId);
  await finish(
    db,
    projectId,
    emit,
    ok
      ? w?.summary
        ? `${w.summary} It's on the canvas.`
        : "It's on the canvas."
      : "The models were too slow to finish this in time. Try again, or simplify the request."
  );
  return board;
}

export async function runProject(db: SupabaseClient, projectId: string, onEvent?: (e: AgentEvent) => void) {
  const { data: project } = await db.from("projects").select("template, status, goal").eq("id", projectId).single();
  const template = getTemplate(project?.template ?? "blank");
  const wasNeedsInput = project?.status === "needs_input";

  // Flip to "running" before anything else — including checkClarify, which
  // makes its own model call and previously ran while status was still
  // "idle". If that call was ever slow (or the function got killed before
  // it returned), the project sat at "idle" with zero visible feedback and
  // zero DB write for the user to see, indistinguishable from "did my click
  // even register?". Now there's always an immediate, visible state change.
  await db.from("projects").update({ status: "running", updated_at: new Date().toISOString() }).eq("id", projectId);
  const deadline = Date.now() + PIPELINE_DEADLINE_MS;

  if (!wasNeedsInput) {
    const emit = makeEmitter(db, projectId, onEvent);
    const paused = await checkClarify(db, projectId, project?.goal ?? "", template, emit);
    if (paused) return;
  } else {
    // Resuming after the user answered: fold the reply into the goal so
    // every role downstream — the Planner first — sees the fuller picture,
    // not just the original thin prompt.
    const { data: msgs } = await db
      .from("messages")
      .select("content")
      .eq("project_id", projectId)
      .eq("role", "user")
      .order("created_at");
    const answer = msgs?.[msgs.length - 1]?.content;
    if (answer) {
      await db
        .from("projects")
        .update({ goal: `${project.goal ?? ""}\n\nAdditional detail from the user: ${answer}` })
        .eq("id", projectId);
    }
  }

  try {
    return template.research
      ? await runResearch(db, projectId, onEvent, deadline)
      : await runDirect(db, projectId, onEvent, deadline);
  } catch (e) {
    await db.from("projects").update({ status: "error" }).eq("id", projectId);
    throw e;
  }
}

/**
 * A chat message on a finished artifact: the Writer edits index.html in place
 * (optionally scoped to one Inspector-selected element), keeping citations.
 */
export async function runEdit(
  db: SupabaseClient,
  projectId: string,
  message: string,
  target: { id: string; tag: string } | null,
  onEvent?: (e: AgentEvent) => void
) {
  const board = await Board.load(db, projectId);
  const template = getTemplate(board.template);
  const emit = makeEmitter(db, projectId, onEvent);

  const input = `The user asked for a change to index.html: ${JSON.stringify(message)}${
    target ? `\nIt concerns the element with data-el="${target.id}" (${target.tag}). Change only that element unless asked otherwise.` : ""
  }${
    template.research
      ? `\nVerified claims (cite by sourceId): ${JSON.stringify(board.claims)}\nKeep every citation attached to its claim.`
      : ""
  }`;
  const w = await runAgent(db, "writer", board, template, input, emit);
  await say(emit, w?.summary || "Done. Saved a new version of index.html.");
  await emit({ type: "done", payload: {} });
  await db.from("projects").update({ updated_at: new Date().toISOString() }).eq("id", projectId);
}
