import type { Question } from "@/lib/questions";

/**
 * How deep a research report goes. The user picks it in the scoping form the
 * agent asks first; it sets the per-turn research allowance and the page count
 * the printed report is checked against.
 */
export type ResearchDepth = { key: string; label: string; pages: [number, number]; sources: number };

export const RESEARCH_DEPTHS: ResearchDepth[] = [
  { key: "quick", label: "Quick overview (1–2 pages, about 5 sources)", pages: [1, 2], sources: 6 },
  { key: "standard", label: "Standard report (3–5 pages, about 10 sources)", pages: [3, 5], sources: 12 },
  { key: "deep", label: "Deep dive (6–10 pages, 15+ sources)", pages: [6, 10], sources: 20 },
];

export const DEFAULT_DEPTH = RESEARCH_DEPTHS[1];

/** The question every research scoping form includes. */
export const DEPTH_QUESTION: Question = {
  id: "depth",
  question: "How deep should the research go?",
  type: "single",
  options: RESEARCH_DEPTHS.map((d) => d.label),
  help: "This sets how many sources I read and how many pages the report runs.",
  other: true,
  default: DEFAULT_DEPTH.label,
};

const asksDepth = (q: Question) => /\b(deep|depth|detail|thorough|how (long|far)|length|pages?)\b/i.test(q.question);

/** Research forms always ask about depth: the model's own depth question is kept, otherwise the standard one goes first. */
export function withDepthQuestion(questions: Question[]): Question[] {
  return questions.some(asksDepth) ? questions : [DEPTH_QUESTION, ...questions].slice(0, 8);
}

/**
 * The depth the user chose, read from their messages (newest first): one of the
 * form's options, a page count ("about 8 pages"), or plain words ("quick",
 * "in-depth"). Null when they haven't said.
 */
export function depthFrom(texts: string[]): ResearchDepth | null {
  for (const text of texts) {
    for (const d of RESEARCH_DEPTHS) if (text.includes(d.label) || new RegExp(`\\b${d.label.split(" (")[0]}\\b`, "i").test(text)) return d;
    const pages = /\b(\d{1,2})\s*(?:(?:-|–|to)\s*(\d{1,2})\s*)?pages?\b/i.exec(text);
    if (pages) {
      const lo = Math.max(1, Number(pages[1]));
      const hi = Math.max(lo, Number(pages[2] ?? lo));
      return { key: "custom", label: `${lo === hi ? lo : `${lo}–${hi}`} page${hi > 1 ? "s" : ""}`, pages: [lo, hi], sources: Math.min(20, Math.max(6, 3 + hi * 2)) };
    }
    // Only unmistakable words: "an overview of the market" isn't a length choice.
    if (/\b(in[- ]depth|comprehensive|exhaustive|deep[- ]dive)\b/i.test(text)) return RESEARCH_DEPTHS[2];
    if (/\b(quick|brief)\b/i.test(text)) return RESEARCH_DEPTHS[0];
  }
  return null;
}
