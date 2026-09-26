import type { SupabaseClient } from "@supabase/supabase-js";
import { chat, modelKeyFor, type ChatMessage, type ToolSchema } from "@/lib/gateway";
import { makeEmitter, type AgentEvent } from "@/lib/events";
import { FILE_TOOL_SCHEMAS, makeFileTools, cleanPath } from "@/lib/tools/files";
import { SourceRegistry, WEB_TOOL_SCHEMAS } from "@/lib/tools/tavily";
import { makeRepoTools, REPO_TOOL_SCHEMAS } from "@/lib/tools/github";
import { finalizeArtifact } from "@/lib/finalize";
import { getTemplate } from "@/lib/templates";
import { describeForAgent, fromRow } from "@/lib/designSystems";
import { listFiles, readFile } from "@/lib/projectData";

// One invocation must finish inside the route's maxDuration (300s). Past
// this budget the turn pauses and the client resumes it in a fresh
// invocation — see the "continue" event.
const TURN_BUDGET_MS = Number(process.env.TURN_BUDGET_MS ?? 270_000);
const STOP_MARGIN_MS = 20_000;
const MAX_STEPS = 30;
const MAX_ACTIVE_FILE_CHARS = 60_000;

const ASK_SCHEMA: ToolSchema = {
  type: "function",
  function: {
    name: "ask_questions",
    description:
      "Ask the user a short brief (1–4 questions, each with 2–5 suggested answers) before designing. Ends your turn; their answers arrive as the next message.",
    parameters: {
      type: "object",
      properties: {
        intro: { type: "string", description: "One short sentence introducing the questions" },
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "short key, e.g. audience" },
              question: { type: "string" },
              options: { type: "array", items: { type: "string" } },
            },
            required: ["id", "question", "options"],
          },
        },
      },
      required: ["questions"],
    },
  },
};

const SAVE_DS_SCHEMA: ToolSchema = {
  type: "function",
  function: {
    name: "save_design_system",
    description:
      "Save a design system (named colors + fonts) so it appears in the design system picker for future projects, and apply it to this one. Use when the user asks you to create or extract a design system.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        colors: {
          type: "array",
          description: "5–10 colors; include roles named Background, Surface, Text and Accent",
          items: { type: "object", properties: { name: { type: "string" }, hex: { type: "string", description: "#rrggbb" } }, required: ["name", "hex"] },
        },
        fonts: {
          type: "array",
          description: "Heading first, then Body (and optionally Mono), as CSS stacks naming Google Fonts families, e.g. 'Fraunces', serif",
          items: { type: "object", properties: { role: { type: "string" }, stack: { type: "string" } }, required: ["role", "stack"] },
        },
      },
      required: ["name", "colors", "fonts"],
    },
  },
};

async function saveDesignSystem(db: SupabaseClient, projectId: string, args: any) {
  const colors = (Array.isArray(args.colors) ? args.colors : [])
    .map((c: any) => ({ name: String(c?.name ?? "Color").slice(0, 40), hex: String(c?.hex ?? "").trim().toLowerCase() }))
    .map((c: any) => (/^#[0-9a-f]{3}$/.test(c.hex) ? { ...c, hex: "#" + [...c.hex.slice(1)].map((ch) => ch + ch).join("") } : c))
    .filter((c: any) => /^#[0-9a-f]{6}$/.test(c.hex))
    .slice(0, 12);
  const fonts = (Array.isArray(args.fonts) ? args.fonts : [])
    .filter((f: any) => f?.stack)
    .slice(0, 4)
    .map((f: any) => ({ role: String(f.role ?? "Body").slice(0, 40), stack: String(f.stack).replace(/"/g, "'").slice(0, 120) }));
  if (colors.length < 2) throw new Error("give at least two colors as #rrggbb hex values");
  if (!fonts.length) throw new Error("give at least one font");
  const name = String(args.name ?? "").trim().slice(0, 60) || "Untitled system";
  const { data, error } = await db.from("design_systems").insert({ owner_id: null, name, tokens: { colors, fonts } }).select("*").single();
  if (error || !data) throw new Error(`saving the design system failed: ${error?.message}`);
  await db.from("projects").update({ design_system_id: data.id }).eq("id", projectId);
  return fromRow(data);
}

function systemPrompt(opts: { templateBrief: string; designSystem: string; codebase: string | null; research: boolean }) {
  return `You are the design agent in Demonic Search, a design tool where people describe what they want and you make it on a live canvas. You work like a senior product designer who writes production-quality HTML, CSS and JavaScript.

## Files
- Every design is a file in this project: one complete, self-contained HTML document (inline <style> and <script>). External resources only from Google Fonts, cdn.jsdelivr.net, unpkg.com or cdnjs.cloudflare.com. No build step, no frameworks that need compiling.
- Name files for what they are: "Landing Page.html", "Q3 Board Deck.html", "Onboarding Flow.html". Make a new file for a genuinely new artifact or variation; otherwise edit the existing one.
- For targeted edits use str_replace with an exact, unique snippet of the current file. Use write_file to create a file or when most of it changes.
- Keep data-el attributes on elements intact — the user's direct edits rely on them.

## How you work
- Before each batch of tool calls, write one short line (under 12 words) saying what you're doing, as a present participle, e.g. "Picking a font pairing and accent color." It appears as a progress row.
- If a brand-new request leaves the important choices open (audience, content, tone, format), you may call ask_questions once with 1–4 quick questions and suggested answers instead of guessing. If the request is already specific enough, just start designing. Never ask twice in a row.
- If the user asks you to create, extract or define a design system, make a visual spec file for it (palette with roles and hex values, type scale, spacing/radius, core components in their states) and call save_design_system so it becomes reusable.
- When the user comments on a specific element, you get its HTML; change that element and leave the rest alone.
- When you're done, reply in 1–3 short sentences: what you made or changed, and optionally one idea for what to refine next. Plain prose; **bold** is fine; no headings, no code. Make no tool calls after that reply.

## Design quality
- Commit to a clear visual direction: a deliberate type pairing (Google Fonts), a restrained palette defined as CSS custom properties on :root, one accent color used with intent, and a consistent spacing scale.
- Strong hierarchy and real, specific content — never lorem ipsum, never "Feature 1". Invent plausible names, numbers and copy when the user didn't provide them.
- Icons are inline SVG (simple 1.5px-stroke line icons), never emoji. Images: use CSS gradients, SVG illustration or shapes rather than external stock photo URLs.
- Layout with CSS grid/flexbox; it must look right at the canvas width and be responsive. Check contrast. Avoid generic "AI" aesthetics: no purple-blue gradients everywhere, no glassmorphism by default, no centered-everything.
- Printable formats (documents, slides, résumés) include @page and page-break rules so browser print → PDF looks right.

## Tweaks
Expose 2–5 meaningful live controls when they'd help the user explore (accent color, density, speed, which screen to show, a layout variant). Declare them in the file as:
<script type="application/json" id="tweaks">[{"name":"accent","label":"Accent","type":"color","value":"#d9774f"},{"name":"speed","type":"range","min":200,"max":2000,"step":50,"value":700,"unit":"ms"},{"name":"startScreen","type":"select","options":["home","detail"],"value":"home"},{"name":"grid","type":"toggle","value":false}]</script>
The canvas applies every value as a CSS custom property on :root (--accent, --speed with its unit, --grid as 1/0), as an attribute on <html> (data-start-screen="detail" — camelCase names become kebab-case), and fires window.addEventListener("tweak", e => e.detail.name / e.detail.value) on load and on every change. Use var(--name) in CSS or the event in JS.
${opts.research ? "\n## Research\nweb_search and web_fetch give you sources with IDs (S1, S2…). Cite every factual sentence as [S3] or [S3, S5] using only IDs you were given; a numbered sources list is added automatically. Never write URLs as citations.\n" : "\n## Facts\nweb_search / web_fetch are available if the request depends on real-world facts you're unsure of; cite what you use as [S3]. Most design work needs no search.\n"}
## This project
Starting template: ${opts.templateBrief}
${opts.designSystem || "No design system selected — choose a fitting visual direction yourself."}
${opts.codebase ? `\nConnected codebase: ${opts.codebase}. Before designing, use repo_tree / repo_read to study its UI code (components, global CSS, Tailwind/theme config, tokens) and match its visual language, component patterns and real product copy.` : ""}`;
}

/** Decode the JSON string value of `key` from a tool call's partial argument text. */
function partialJsonString(args: string, key: string): string | null {
  const m = new RegExp(`"${key}"\\s*:\\s*"`).exec(args);
  if (!m) return null;
  let i = m.index + m[0].length;
  let out = "";
  while (i < args.length) {
    const ch = args[i];
    if (ch === '"') break;
    if (ch === "\\") {
      const nx = args[i + 1];
      if (nx === undefined) break;
      if (nx === "u") {
        const hex = args.slice(i + 2, i + 6);
        if (hex.length < 4) break;
        out += String.fromCharCode(parseInt(hex, 16));
        i += 6;
        continue;
      }
      out += ({ n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" } as Record<string, string>)[nx] ?? nx;
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

function describeUserMessage(m: { content: string; meta: any }, full: boolean) {
  let text = m.content;
  const meta = m.meta ?? {};
  if (meta.target) {
    const t = meta.target;
    text = `(Comment on the <${t.tag}> element${t.path ? ` in ${t.path}` : ""}${t.id ? ` with data-el="${t.id}"` : ""}:\n${String(t.html ?? t.text ?? "").slice(0, 1500)}\n)\n\n${text}`;
  }
  for (const a of meta.attachments ?? []) {
    text += full && a.content ? `\n\nAttached file "${a.name}":\n${String(a.content).slice(0, 40000)}` : `\n\n(Attached file "${a.name}")`;
  }
  return text;
}

export type TurnOptions = {
  onEvent?: (e: AgentEvent & { id?: string; created_at?: string }) => void;
  signal?: AbortSignal;
  resume?: boolean;
  activeFile?: string | null;
};

export async function runTurn(db: SupabaseClient, projectId: string, opts: TurnOptions = {}) {
  const deadline = Date.now() + TURN_BUDGET_MS;
  const emit = makeEmitter(db, projectId, opts.onEvent);
  const touch = (extra: Record<string, unknown> = {}) =>
    db.from("projects").update({ updated_at: new Date().toISOString(), ...extra }).eq("id", projectId);

  const { data: project } = await db.from("projects").select("*").eq("id", projectId).single();
  if (!project) throw new Error("project not found");
  await touch({ status: "running" });

  const [dsRes, { data: history }, files, sources] = await Promise.all([
    project.design_system_id
      ? db.from("design_systems").select("*").eq("id", project.design_system_id).single()
      : Promise.resolve({ data: null }),
    db.from("messages").select("role, content, meta, created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(30),
    listFiles(db, projectId),
    SourceRegistry.load(db, projectId, project.budget),
  ]);

  const template = getTemplate(project.template);
  const fileTools = makeFileTools(db, projectId, (html) => finalizeArtifact(html, sources.sources));
  const repo = project.codebase ? makeRepoTools(project.codebase) : null;
  const tools: ToolSchema[] = [...FILE_TOOL_SCHEMAS, ...WEB_TOOL_SCHEMAS, ...(repo ? REPO_TOOL_SCHEMAS : []), SAVE_DS_SCHEMA, ASK_SCHEMA];

  const msgs = (history ?? []).reverse();
  const lastUserIdx = msgs.map((m) => m.role).lastIndexOf("user");
  const convo: ChatMessage[] = [
    {
      role: "system",
      content: systemPrompt({
        templateBrief: `${template.label} — ${template.brief}`,
        designSystem: describeForAgent(dsRes.data ? fromRow(dsRes.data) : null),
        codebase: project.codebase,
        research: template.id === "research",
      }),
    },
  ];
  msgs.forEach((m, i) => {
    if (m.role === "user") convo.push({ role: "user", content: describeUserMessage(m, i === lastUserIdx) });
    else if (m.role === "assistant" && m.content) convo.push({ role: "assistant", content: m.content });
  });

  // Current state of the canvas, so small edits don't need a read_file round trip first.
  const active = files.find((f) => f.path === opts.activeFile) ?? files[0];
  let context = files.length
    ? `\n\n---\nFiles in this project: ${files.map((f) => `"${f.path}" (v${f.version})`).join(", ")}.`
    : "\n\n---\nThe project has no files yet.";
  if (active) {
    const cur = await readFile(db, projectId, active.path);
    if (cur && cur.content.length <= MAX_ACTIVE_FILE_CHARS) {
      context += `\nThe user is looking at "${active.path}". Its current contents (v${cur.version}):\n\`\`\`html\n${cur.content}\n\`\`\``;
    } else if (cur) {
      context += `\nThe user is looking at "${active.path}" (too long to include — read_file it before editing).`;
    }
  }
  if (opts.resume) context += "\n\nYou were interrupted by a time limit partway through this request. Continue from where the files are now; don't start over.";
  const lastUser = [...convo].reverse().find((m) => m.role === "user");
  if (lastUser) lastUser.content += context;
  else convo.push({ role: "user", content: `Continue.${context}` });

  const touched = new Map<string, { version: number; created: boolean }>();
  let badCalls = 0;
  let status: "ready" | "running" = "ready";

  const finish = async (reply: string | null) => {
    if (reply) {
      const meta = { files: [...touched].map(([path, v]) => ({ path, ...v })) };
      const { data: message } = await db
        .from("messages")
        .insert({ project_id: projectId, role: "assistant", content: reply, meta, created_at: new Date().toISOString() })
        .select("id, role, content, meta, created_at")
        .single();
      if (message) await emit({ type: "message", payload: { message } });
    }
  };

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      if (opts.signal?.aborted) {
        await finish(touched.size ? "Stopped. What's on the canvas so far is saved." : null);
        break;
      }
      if (deadline - Date.now() < STOP_MARGIN_MS) {
        status = "running";
        await emit({ type: "continue", payload: {} });
        break;
      }

      const drafts = new Map<number, { path: string; sent: number; at: number }>();
      const stepStart = Date.now();
      let r;
      try {
        r = await chat(modelKeyFor(project.model_profile), {
          messages: convo,
          tools,
          deadline,
          signal: opts.signal,
          onToken: (t) => void emit({ type: "token", payload: { t } }),
          onReasoning: (t) => void emit({ type: "reasoning", payload: { t } }),
          onToolDelta: (index, name, args) => {
            if (name !== "write_file") return;
            const d = drafts.get(index) ?? { path: "", sent: 0, at: 0 };
            const now = Date.now();
            if (now - d.at < 250) return;
            d.at = now;
            const path = /"path"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(args)?.[1];
            const content = partialJsonString(args, "content");
            if (path && !d.path) {
              try {
                d.path = cleanPath(JSON.parse(`"${path}"`));
              } catch {
                d.path = cleanPath(path);
              }
            }
            drafts.set(index, d);
            if (!d.path || content == null || content.length <= d.sent) return;
            void emit({ type: "draft", payload: { path: d.path, append: content.slice(d.sent), reset: d.sent === 0 } });
            d.sent = content.length;
          },
        });
      } catch (e) {
        if (opts.signal?.aborted) {
          await finish(touched.size ? "Stopped. What's on the canvas so far is saved." : null);
          break;
        }
        if ((e as any)?.name === "TimeoutError" && deadline - Date.now() < STOP_MARGIN_MS + 5000) {
          status = "running";
          await emit({ type: "continue", payload: {} });
          break;
        }
        await emit({ type: "error", payload: { message: e instanceof Error ? e.message : String(e) } });
        break;
      }

      const thought = r.reasoning.trim();
      if (thought) await emit({ type: "thought", payload: { text: thought.length > 12000 ? "…" + thought.slice(-12000) : thought, ms: Date.now() - stepStart } });

      const text = r.content.trim();
      if (!r.toolCalls.length) {
        await finish(text || (touched.size ? "Done — it's on the canvas." : "I couldn't produce anything for that. Try rephrasing?"));
        break;
      }
      if (text) await emit({ type: "note", payload: { text: text.slice(0, 240) } });

      convo.push({
        role: "assistant",
        content: r.content || null,
        tool_calls: r.toolCalls.map((tc, i) => ({ id: tc.id || `call_${step}_${i}`, type: "function", function: { name: tc.name, arguments: tc.args } })),
      });

      let asked = false;
      for (const [i, tc] of r.toolCalls.entries()) {
        const callId = `${step}-${i}-${tc.id || ""}`;
        const toolCallId = tc.id || `call_${step}_${i}`;
        let result: unknown;
        let args: any = {};
        try {
          try {
            args = JSON.parse(tc.args || "{}");
          } catch {
            throw new Error(
              r.finish === "length"
                ? "your tool call was cut off because it was too long — write a shorter file, or build it up with str_replace"
                : "tool arguments were not valid JSON"
            );
          }
          const shown =
            tc.name === "write_file" || tc.name === "str_replace" || tc.name === "read_file"
              ? { path: cleanPath(args.path) }
              : tc.name === "ask_questions"
                ? {}
                : args;
          await emit({ type: "tool-call", payload: { callId, name: tc.name, args: shown } });

          let summary: Record<string, unknown> = {};
          switch (tc.name) {
            case "write_file":
            case "str_replace": {
              const w = tc.name === "write_file" ? await fileTools.write_file(args) : await fileTools.str_replace(args);
              const prev = touched.get(w.path);
              touched.set(w.path, { version: w.version, created: prev?.created ?? w.created });
              result = { ok: true, path: w.path, version: w.version };
              summary = { path: w.path, version: w.version, created: w.created };
              break;
            }
            case "read_file": {
              const f = await fileTools.read_file(args);
              result = f;
              summary = { path: f.path, version: f.version };
              break;
            }
            case "web_search": {
              const hits = await sources.search(args);
              result = hits;
              summary = { query: args.query, results: hits.map((h) => ({ id: h.id, title: h.title, url: sources.sources.get(h.id)?.url })) };
              break;
            }
            case "web_fetch": {
              const f = await sources.fetch(args);
              result = f;
              summary = { source: { id: f.id, title: f.title, url: sources.sources.get(f.id)?.url } };
              break;
            }
            case "repo_tree":
            case "repo_read": {
              if (!repo) throw new Error("no codebase is connected");
              result = tc.name === "repo_tree" ? await repo.repo_tree(args) : await repo.repo_read(args);
              summary = { path: args.path ?? "" };
              break;
            }
            case "save_design_system": {
              const saved = await saveDesignSystem(db, projectId, args);
              result = { ok: true, id: saved.id, note: "Saved. It's now in the design system picker and set as this project's design system." };
              summary = { dsName: saved.name, system: saved };
              break;
            }
            case "ask_questions": {
              const questions = (Array.isArray(args.questions) ? args.questions : [])
                .slice(0, 4)
                .map((q: any, qi: number) => ({
                  id: String(q.id || `q${qi + 1}`).slice(0, 40),
                  question: String(q.question ?? "").slice(0, 300),
                  options: (Array.isArray(q.options) ? q.options : []).slice(0, 6).map((o: any) => String(o).slice(0, 120)),
                }))
                .filter((q: any) => q.question);
              if (!questions.length) throw new Error("no questions given");
              await emit({ type: "questions", payload: { intro: String(args.intro ?? "").slice(0, 300), questions } });
              result = { ok: true, note: "The user will answer in their next message." };
              asked = true;
              break;
            }
            default:
              throw new Error(`unknown tool: ${tc.name}`);
          }
          await emit({ type: "tool-result", payload: { callId, name: tc.name, ...summary } });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          result = { error: message };
          await emit({ type: "tool-result", payload: { callId, name: tc.name, error: message } });
          badCalls++;
        }
        convo.push({ role: "tool", tool_call_id: toolCallId, content: JSON.stringify(result) });
      }
      await touch();
      if (asked) break;
      if (badCalls > 5) {
        await emit({ type: "error", payload: { message: "Too many failed tool calls — stopping here." } });
        break;
      }
      if (step === MAX_STEPS - 1) await finish("I hit the step limit for one turn. Say “continue” and I'll keep going.");
    }
  } finally {
    await touch({ status, budget: { ...(project.budget ?? {}), searchesLeft: sources.searchesLeft } });
    await emit({ type: "done", payload: {} });
  }
}
