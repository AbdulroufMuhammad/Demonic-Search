/**
 * The clarifying-questions form the agent can ask before designing. Shared by
 * the agent (schema + cleaning what the model sends) and the chat (rendering
 * the form and turning answers into the next message).
 */
export type QuestionType = "single" | "multi" | "select" | "text" | "long" | "number" | "slider" | "toggle";

export type Question = {
  id: string;
  question: string;
  type: QuestionType;
  options: string[];
  /** Short hint under the question. */
  help?: string;
  placeholder?: string;
  /** For single/multi: show an "Other" field. */
  other?: boolean;
  min?: number;
  max?: number;
  step?: number;
  /** Prefilled answer: an option, a number, "yes"/"no", or several options for multi. */
  default?: string | number | string[];
};

export const QUESTION_TYPES: QuestionType[] = ["single", "multi", "select", "text", "long", "number", "slider", "toggle"];
const MAX_QUESTIONS = 8;

export const ASK_PARAMETERS = {
  type: "object",
  properties: {
    intro: { type: "string", description: "One short sentence introducing the form" },
    questions: {
      type: "array",
      description: `1–${MAX_QUESTIONS} questions, most important first`,
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "short key, e.g. audience" },
          question: { type: "string" },
          type: {
            type: "string",
            enum: QUESTION_TYPES,
            description:
              "single: pick one option (chips). multi: pick any number of options (checkboxes), e.g. features, sections or pages needed. select: pick one from a long list (dropdown). text: short free answer, e.g. a name. long: a paragraph. number: a count. slider: a value in a range (min/max/step). toggle: yes or no.",
          },
          options: { type: "array", items: { type: "string" }, description: "For single, multi and select: 2–12 concrete choices" },
          help: { type: "string", description: "Optional one-line hint" },
          placeholder: { type: "string" },
          other: { type: "boolean", description: "For single/multi: also offer an 'Other' text field (default true)" },
          min: { type: "number" },
          max: { type: "number" },
          step: { type: "number" },
          default: { description: "Optional preselected answer" },
        },
        required: ["id", "question", "type"],
      },
    },
  },
  required: ["questions"],
};

const str = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : typeof v === "string" && v.trim() && isFinite(Number(v)) ? Number(v) : undefined);

/**
 * Clean what the model sent into a form the chat can render; unknown or broken
 * fields fall back to sensible defaults. Also reads questions stored before
 * types existed ({ id, question, options }) as single-choice questions.
 */
export function cleanQuestions(raw: unknown): Question[] {
  const seen = new Set<string>();
  return (Array.isArray(raw) ? raw : [])
    .slice(0, MAX_QUESTIONS)
    .map((q: any, i: number): Question | null => {
      const question = str(q?.question, 300);
      if (!question) return null;
      let id = str(q?.id, 40).replace(/\s+/g, "_") || `q${i + 1}`;
      while (seen.has(id)) id += "_";
      seen.add(id);
      const options = [...new Set((Array.isArray(q?.options) ? q.options : []).map((o: unknown) => str(o, 120)).filter(Boolean))].slice(0, 12) as string[];
      let type: QuestionType = QUESTION_TYPES.includes(q?.type) ? q.type : options.length ? "single" : "text";
      if ((type === "single" || type === "multi" || type === "select") && options.length < 2) type = "text";
      if (type === "single" && options.length > 7) type = "select";
      const out: Question = { id, question, type, options: type === "single" || type === "multi" || type === "select" ? options : [] };
      const help = str(q?.help, 200);
      if (help) out.help = help;
      const placeholder = str(q?.placeholder, 120);
      if (placeholder) out.placeholder = placeholder;
      if (type === "single" || type === "multi") out.other = q?.other !== false;
      if (type === "number" || type === "slider") {
        out.min = num(q?.min) ?? (type === "slider" ? 0 : undefined);
        out.max = num(q?.max) ?? (type === "slider" ? 10 : undefined);
        if (out.min != null && out.max != null && out.max <= out.min) out.max = out.min + 10;
        out.step = num(q?.step) ?? 1;
      }
      const d = q?.default;
      if (type === "multi" && Array.isArray(d)) out.default = d.map((x) => str(x, 120)).filter((x) => options.includes(x));
      else if ((type === "single" || type === "select") && options.includes(str(d, 120))) out.default = str(d, 120);
      else if ((type === "number" || type === "slider") && num(d) != null) out.default = num(d);
      else if (type === "toggle" && (d === true || d === false || /^(yes|no)$/i.test(str(d, 3)))) out.default = d === true || /^yes$/i.test(str(d, 3)) ? "yes" : "no";
      else if ((type === "text" || type === "long") && typeof d === "string" && d.trim()) out.default = str(d, 500);
      return out;
    })
    .filter((q): q is Question => !!q);
}

export type Answer = string | string[] | number | null;

export function formatAnswer(q: Question, a: Answer): string {
  if (a == null || (Array.isArray(a) && !a.length) || (typeof a === "string" && !a.trim())) return "Your call";
  if (Array.isArray(a)) return a.join(", ");
  if (q.type === "toggle") return a === "yes" ? "Yes" : "No";
  if (q.type === "slider" && q.min != null && q.max != null) return `${a} on a ${q.min} to ${q.max} scale`;
  return String(a).trim();
}

/** The message the answers are sent as: each question with its answer, so the model has full context. */
export function answersMessage(questions: Question[], answers: Record<string, Answer>, skipped = false): string {
  if (skipped) return "Skip the questions and use your judgement for all of them.";
  return questions.map((q) => `${q.question}\n→ ${formatAnswer(q, answers[q.id] ?? null)}`).join("\n\n");
}
