export type TemplateId =
  | "blank"
  | "document"
  | "slides"
  | "diagram"
  | "report"
  | "research";

export type Template = {
  id: TemplateId;
  label: string;
  icon: string;
  research: boolean;
  writerSkill: string;
  defaultExport: "pdf" | "pptx" | "html";
};

export const TEMPLATES: Template[] = [
  { id: "blank", label: "Blank", icon: "▯", research: false, defaultExport: "html", writerSkill: "Produce a single self-contained HTML file for whatever the user asked for." },
  { id: "document", label: "Document", icon: "▦", research: false, defaultExport: "pdf", writerSkill: "Write one flowing HTML document body. Use a <style> block with an @page rule for size/margins and running headers. Keep it printable." },
  { id: "slides", label: "Slides", icon: "≡", research: false, defaultExport: "pptx", writerSkill: "Write a fixed 1920x1080 <section class=\"slide\"> per slide inside one HTML file. Put speaker notes in a data-notes attribute on each section." },
  { id: "wireframe", label: "Wireframe", icon: "▶", research: false, defaultExport: "html", writerSkill: "Produce a low-fidelity HTML/CSS wireframe: boxes, labels, no real content." },
  { id: "diagram", label: "Diagram", icon: "◫", research: false, defaultExport: "html", writerSkill: "Produce a single HTML file with an inline SVG diagram. Prefer CSS grid for architecture boxes, SVG for flows and connectors." },
  { id: "research", label: "Research", icon: "⌕", research: true, defaultExport: "pdf", writerSkill: "Write a document shell (see 'document') from the verified claims on the board. Every factual sentence must cite a source ID like [S3]. Include a Sources section listing each cited source's title and URL." },
] as unknown as Template[];

export function getTemplate(id: string): Template {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}
