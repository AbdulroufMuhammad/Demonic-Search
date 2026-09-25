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
Then 3 to 5 <section> elements, each an <h2> heading followed by content (see blocks below).
In the most important section you may add one pull quote: <blockquote data-src="S3"><p>the exact quote text of a verified claim</p></blockquote>.
If an open gap remains, end with <aside class="open-question"><p>The question the sources do not settle.</p></aside>.
Every factual sentence ends with its source ID in square brackets, like [S3] or [S3, S5]. Use only source IDs from the verified claims.

CONTENT BLOCKS — inside a <section>, mixed in with your <p> paragraphs wherever one earns its place. Use only the blocks that genuinely fit this request; a plain factual answer needs none of them beyond the structure above, while a feasibility study, comparison, plan, or technical write-up typically earns two or three. Never reach for a block just to look richer — a table that just restates one sentence, or a chart with no real numbers behind it, is decoration, not substance. Pick blocks by what the material actually is, not to hit a quota.

Stat grid — a handful of headline numbers (market size, a before/after comparison, adoption figures):
<div class="stat-grid"><div class="stat-card"><span class="stat-num">42%</span><span class="stat-label">cost reduction [S2]</span></div>…</div>
3 to 5 cards. Every number must come from a verified claim; cite it in the label.

Data table — comparing options, specs, pricing, or anything with more than a couple of columns:
<div class="data-table"><table><thead><tr><th>Option</th><th>Cost</th><th>Status</th></tr></thead><tbody><tr><td>Vendor A</td><td>$12k/mo [S4]</td><td><span class="tag" data-tone="accent">Recommended</span></td></tr></tbody></table></div>
Wrap any status/verdict word in <span class="tag">; data-tone="accent" for recommended/positive, "outline" (the default, can be omitted) for neutral/planned, "muted" for n/a or excluded.

Callout — one genuinely load-bearing point per report at most: an executive summary, the single biggest risk, or a critical assumption everything else depends on:
<div class="callout"><p class="callout-label">Executive summary</p><p>… [S1]</p></div>
Add data-tone="neutral" to the outer div for an assumption/caveat rather than a highlighted takeaway.

Milestones — a roadmap, phased rollout, or implementation plan:
<ol class="milestones"><li><span class="m-when">Week 1–2</span><h4>Discovery</h4><p>… [S2]</p><p class="m-done"><strong>Done when:</strong> a concrete, checkable criterion.</p></li>…</ol>
Every item needs a real "done when" criterion, not a restatement of the activity.

Risk grid — a feasibility or risk-analysis request:
<div class="risk-grid"><div class="risk-card"><h4>Vendor lock-in</h4><p>… [S5]</p><p class="fix"><strong>Mitigation:</strong> …</p></div>…</div>
Each card pairs one real, sourced risk with one concrete mitigation — never a risk with no fix or a fix with no risk.

Code block — only when the request is actually about code, an API, or a technical setup and a short real snippet clarifies it:
<div class="code-block"><div class="cb-bar"><span>bash</span><span>setup.sh</span></div><pre><code>npm install</code></pre></div>
Escape &lt; &gt; and &amp; inside the code text (as &amp;lt; &amp;gt; &amp;amp;) — it renders as literal HTML, not inside a script tag.

Figure — only when an inline SVG diagram (architecture, flow, a simple bar/line chart of real sourced numbers) would clarify something prose can't:
<figure class="figure"><div class="figure-media"><svg …>…</svg></div><figcaption>Fig 1. Caption [S3]</figcaption></figure>
Keep the SVG simple — boxes, arrows, bars — and only plot numbers that came from a verified claim.`;

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
