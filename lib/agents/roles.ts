import type { ModelKey, ToolSchema } from "@/lib/gateway";
import type { Board } from "@/lib/board";
import { TAVILY_TOOL_SCHEMAS } from "@/lib/tools/tavily";
import { FILE_TOOL_SCHEMAS } from "@/lib/tools/files";
import type { Template } from "@/lib/templates";
import { describeForWriter } from "@/lib/designSystems";

export type RoleName = "planner" | "researcher" | "critic" | "writer" | "verifier";

export type RoleConfig = {
  model: ModelKey;
  tools: ToolSchema[];
  maxSteps: number;
  systemPrompt: (board: Board, template: Template) => string;
  parseResult: (content: string) => unknown;
  fallback: (board: Board) => unknown;
};

const jsonFallback = (shape: unknown) => () => shape;

function safeJson(content: string): any {
  const match = content.match(/\{[\s\S]*\}/);
  try {
    return JSON.parse(match ? match[0] : content);
  } catch {
    return null;
  }
}

// Planner/Critic get the faster glm-flash model, not the slower reasoning
// model: their output is short JSON that doesn't need deep reasoning, and a
// live run against NVIDIA's API showed ~20-40s per reasoning-model call —
// with a Researcher's multi-step tool loop and the whole pipeline needing to
// fit inside one Vercel function invocation, that's not a cost to pay twice
// per round for roles that don't need it. Same reasoning caps Researcher's
// maxSteps in MAX_ROUNDS/MAX_FACETS/CONCURRENCY in lib/orchestrator.ts.
export const ROLES: Record<RoleName, RoleConfig> = {
  planner: {
    model: "glm-flash",
    tools: [],
    maxSteps: 1,
    systemPrompt: (board, template) => `You are the Planner. The user wants a ${template.label.toLowerCase()}: ${board.goal}
First decide: does producing this actually need real-world facts pulled from the web (a number, a date, a name, a claim someone could be wrong about), or is it self-contained — something you can write correctly from what you already know (a diagram of named boxes, a UI wireframe, a slide deck explaining a concept you're confident about, a mockup)? Judge by the content, not by what kind of deliverable it is — a "${template.label}" can go either way.
If it needs facts: split into 2-5 independent facets to research in parallel, plus a short outline of the sections/parts you'll produce.
If it doesn't: return an empty facets array, but still include a short outline.
Reply with ONLY JSON of the shape:
{"facets":[{"id":"f1","question":"..."}],"outline":[{"heading":"..."}]}`,
    parseResult: (content) => safeJson(content) ?? { facets: [], outline: [] },
    fallback: jsonFallback({ facets: [], outline: [{ heading: "Overview" }] }),
  },

  researcher: {
    model: "glm-flash",
    tools: TAVILY_TOOL_SCHEMAS,
    maxSteps: 4,
    systemPrompt: () => `You are a Researcher. You get one facet/question. Use web_search and web_fetch
to find supporting evidence. Cite sources only by their short ID (e.g. S3), never by URL — you do not
know the real URL. Every claim needs a short exact quote copied verbatim from the fetched source text.
When done, reply with ONLY JSON: {"claims":[{"text":"...","sourceIds":["S1"],"quote":"exact quote","confidence":0.8}]}`,
    parseResult: (content) => safeJson(content) ?? { claims: [] },
    fallback: jsonFallback({ claims: [] }),
  },

  critic: {
    model: "glm-flash",
    tools: [],
    maxSteps: 1,
    systemPrompt: () => `You are the Critic. Given the goal, outline and current claims, list any
high-value gaps still open. Reply with ONLY JSON:
{"gaps":[{"facetId":"f1","question":"...","priority":"high"|"medium"|"low"}]}
If coverage is sufficient, return {"gaps":[]}.`,
    parseResult: (content) => safeJson(content) ?? { gaps: [] },
    fallback: jsonFallback({ gaps: [] }),
  },

  writer: {
    model: "glm",
    tools: [...FILE_TOOL_SCHEMAS, ...TAVILY_TOOL_SCHEMAS],
    maxSteps: 8,
    systemPrompt: (board, template) => `You are the Writer. ${template.writerSkill}
${template.magazineReport ? "" : describeForWriter(board.designSystem)}
Use write_file / str_replace / read_file to produce the artifact at path "index.html".
Never invent facts. If claims with citations are provided, cite them inline like [S3] and never
alter their meaning. web_search / web_fetch are also available directly to you — use them only if
you hit a specific real-world fact mid-write that you're not confident about; most generative or
structural tasks need no search at all, and searching for those just wastes time. Any source you
find this way gets cited and numbered automatically the same as [S3] above.
When editing an existing file, read it first and change only what was asked.
When the file is finished, reply with one short plain-text sentence saying what you wrote or changed,
and make no further tool calls.`,
    parseResult: (content) => ({ done: true, summary: content.trim() }),
    fallback: jsonFallback({ done: false }),
  },

  verifier: {
    model: "muse",
    tools: FILE_TOOL_SCHEMAS,
    maxSteps: 3,
    systemPrompt: () => `You are the Verifier. Read index.html with read_file and check it is
well-formed HTML with no obviously broken markup or unresolved template placeholders. Reply with
ONLY JSON: {"issues":["..."]} — an empty array means it passed.`,
    parseResult: (content) => safeJson(content) ?? { issues: [] },
    fallback: jsonFallback({ issues: [] }),
  },
};
