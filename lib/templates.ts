export type TemplateId =
  | "blank"
  | "document"
  | "slides"
  | "diagram"
  | "report"
  | "research"
  | "wireframe";

export type Template = {
  id: TemplateId;
  label: string;
  icon: string;
  research: boolean;
  writerSkill: string;
  defaultExport: "pdf" | "pptx" | "html";
};

const RESEARCH_SKILL = `Write the report as semantic HTML inside one <article class="report"> element. Do not write any CSS or <style> tags, and do not write a header, date, stats line or sources list: the house stylesheet and those parts are added automatically from the board. Use exactly this structure, in order:
<h1>Short title</h1>
<p class="dek">One italic sentence saying what the report covers.</p>
<ol class="takeaways"><li>Key takeaway [S1]</li><li>…</li><li>…</li></ol> (exactly three, one sentence each)
Then 3 to 5 <section> elements, each an <h2> heading followed by <p> paragraphs.
In the most important section you may add one pull quote: <blockquote data-src="S3"><p>the exact quote text of a verified claim</p></blockquote>.
If an open gap remains, end with <aside class="open-question"><p>The question the sources do not settle.</p></aside>.
Every factual sentence ends with its source ID in square brackets, like [S3] or [S3, S5]. Use only source IDs from the verified claims.`;

export const TEMPLATES: Template[] = [
  { id: "research", label: "Research", icon: "⌕", research: true, defaultExport: "pdf", writerSkill: RESEARCH_SKILL },
  { id: "document", label: "Document", icon: "▦", research: false, defaultExport: "pdf", writerSkill: "Write one flowing HTML document body. Use a <style> block with an @page rule for size/margins and running headers. Keep it printable." },
  { id: "slides", label: "Slides", icon: "≡", research: false, defaultExport: "pptx", writerSkill: "Write a fixed 1920x1080 <section class=\"slide\"> per slide inside one HTML file. Put speaker notes in a data-notes attribute on each section." },
  { id: "diagram", label: "Diagram", icon: "◫", research: false, defaultExport: "html", writerSkill: "Produce a single HTML file with an inline SVG diagram. Prefer CSS grid for architecture boxes, SVG for flows and connectors." },
  { id: "wireframe", label: "Wireframe", icon: "▶", research: false, defaultExport: "html", writerSkill: "Produce a low-fidelity HTML/CSS wireframe: boxes, labels, no real content." },
  { id: "blank", label: "Blank", icon: "▯", research: false, defaultExport: "html", writerSkill: "Produce a single self-contained HTML file for whatever the user asked for." },
] as unknown as Template[];

export function getTemplate(id: string): Template {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES.find((t) => t.id === "blank")!;
}
