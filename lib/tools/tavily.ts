import type { Board } from "@/lib/board";

const TAVILY = "https://api.tavily.com";

async function tv(path: string, body: Record<string, unknown>) {
  const res = await fetch(TAVILY + path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.TAVILY_API_KEY ?? ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`tavily ${res.status}: ${await res.text()}`);
  return res.json();
}

// Agents only ever see short source IDs, titles and snippets — never raw
// URLs — so a model cannot fabricate a citation link (guide §6).
export async function webSearch(
  board: Board,
  { query, max_results = 6 }: { query: string; max_results?: number }
) {
  board.spend("search");
  const r = await tv("/search", { query, max_results, search_depth: "advanced" });
  const out = [];
  for (const x of r.results ?? []) {
    const id = board.registerSource(x.url, x.title, x.content);
    await board.persistSource(id);
    out.push({ id, title: x.title, snippet: String(x.content ?? "").slice(0, 400), score: x.score });
  }
  return out;
}

export async function webFetch(board: Board, { source_id }: { source_id: string }) {
  const src = board.sources.get(source_id); // only ever a known, registered source
  if (!src) throw new Error("unknown source_id");
  board.spend("extract");
  let text = src.text;
  try {
    const r = await tv("/extract", { urls: [src.url] });
    text = r.results?.[0]?.raw_content ?? text;
  } catch {
    // keep whatever snippet text we already have from search
  }
  src.text = text;
  await board.persistSource(source_id);
  return { id: source_id, text: (text ?? "").slice(0, 20000) };
}

export const TAVILY_TOOL_SCHEMAS = [
  {
    type: "function" as const,
    function: {
      name: "web_search",
      description: "Search the web. Returns short source IDs, titles and snippets — never raw URLs.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          max_results: { type: "number" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "web_fetch",
      description: "Fetch the full extracted text of a source previously returned by web_search.",
      parameters: {
        type: "object",
        properties: { source_id: { type: "string" } },
        required: ["source_id"],
      },
    },
  },
];
