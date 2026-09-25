import { parse, HTMLElement } from "node-html-parser";
import type { Claim } from "@/lib/board";
import { reportVars, googleFontsHref, type DesignSystem } from "@/lib/designSystems";
import { REPORT_CSS, REPORT_FONTS_HREF, CITE_CSS } from "@/lib/report/style";

export type ArtifactContext = {
  /** See the note on Template.magazineReport in lib/templates.ts. */
  magazineReport: boolean;
  sources: Map<string, { url: string; title?: string }>;
  claims: Claim[];
  dropped: Claim[];
  designSystem: DesignSystem | null;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const host = (u: string) => u.replace(/^https?:\/\//, "").split("/")[0];
const PARSE = { comment: false, blockTextElements: { script: true, style: true, noscript: true, pre: true } };

/** Elements the Inspector can select, and the id prefix each one gets. */
const GENERIC_TARGETS = "h1, h2, h3, h4, p, li, blockquote, figcaption, td, th";

function ensureDocument(html: string) {
  let root = parse(html, PARSE);
  if (!root.querySelector("html")) {
    root = parse(`<!doctype html><html><head></head><body>${html}</body></html>`, PARSE);
  }
  const doc = root.querySelector("html")!;
  if (!doc.querySelector("head")) doc.insertAdjacentHTML("afterbegin", "<head></head>");
  if (!doc.querySelector("body")) {
    const head = doc.querySelector("head")!;
    const rest = doc.childNodes.filter((n) => n !== head);
    rest.forEach((n) => doc.removeChild(n));
    const body = parse("<body></body>").querySelector("body")!;
    rest.forEach((n) => body.appendChild(n));
    doc.appendChild(body);
  }
  return root;
}

/** Give every inspectable element a stable data-el id, keeping ids that already exist. */
function assignIds(scope: HTMLElement, pick: (el: HTMLElement) => string | null) {
  const used = new Set(
    scope.querySelectorAll("[data-el]").map((e) => e.getAttribute("data-el")!)
  );
  const counters: Record<string, number> = {};
  for (const el of scope.querySelectorAll(GENERIC_TARGETS + ", .dek, .open-question")) {
    if (el.getAttribute("data-el")) continue;
    const prefix = pick(el);
    if (!prefix) continue;
    if (prefix === "title" || prefix === "dek" || prefix === "oq") {
      if (!used.has(prefix)) {
        el.setAttribute("data-el", prefix);
        used.add(prefix);
        continue;
      }
    }
    let n = counters[prefix] ?? 1;
    while (used.has(`${prefix}${n}`)) n++;
    counters[prefix] = n + 1;
    el.setAttribute("data-el", `${prefix}${n}`);
    used.add(`${prefix}${n}`);
  }
}

function citeMarkup(html: string) {
  // [S3] or [S3, S5] written by the Writer → one <sup class="cite"> per source.
  return html.replace(/\[(S\d+(?:\s*[,;]\s*S\d+)*)\]/g, (_m, ids: string) =>
    ids
      .split(/[,;]/)
      .map((id) => `<sup class="cite" data-src="${id.trim()}">${id.trim()}</sup>`)
      .join("")
  );
}

function styleBlock(ds: DesignSystem | null) {
  const vars = Object.entries(reportVars(ds))
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
  return `<style id="ds-house">${REPORT_CSS}${vars ? `:root{${vars}}` : ""}</style>`;
}

/**
 * Citation numbers follow first appearance; unknown source IDs (the Writer
 * citing something not in ctx.sources) are stripped rather than left broken.
 * Shared by both the magazine layout and the light path below, since any
 * template's Writer can now produce [S#] citations.
 */
function numberCitations(scope: HTMLElement, ctx: ArtifactContext) {
  const order: string[] = [];
  for (const sup of scope.querySelectorAll("sup.cite")) {
    const id = sup.getAttribute("data-src") ?? "";
    if (!ctx.sources.has(id)) {
      sup.remove();
      continue;
    }
    if (!order.includes(id)) order.push(id);
    sup.set_content(String(order.indexOf(id) + 1));
  }
  return order;
}

function finalizeResearch(root: HTMLElement, ctx: ArtifactContext) {
  const body = root.querySelector("body")!;
  let article = body.querySelector("article.report") ?? body.querySelector("article");
  if (!article) {
    body.set_content(`<article class="report">${body.innerHTML}</article>`, PARSE);
    article = body.querySelector("article")!;
  }
  article.classList.add("report");

  // Writer-authored CSS would fight the house stylesheet.
  root.querySelectorAll("style").forEach((s) => s.getAttribute("id") !== "ds-house" && s.remove());

  const order = numberCitations(article, ctx);
  const num = (id: string) => order.indexOf(id) + 1;
  const quoteFor = (id: string) => ctx.claims.find((c) => c.sourceIds.includes(id))?.quote;

  // Header rule and date.
  article.querySelectorAll(".r-meta, .r-stats, .r-sources").forEach((n) => n.remove());
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  article.insertAdjacentHTML(
    "afterbegin",
    `<header class="r-meta"><span>Research report</span><span>${date}</span></header>`
  );

  // Stats line under the dek (or the title).
  const words = article.textContent.split(/\s+/).filter(Boolean).length;
  const stats = `<div class="r-stats"><span>${order.length} sources</span><span>${ctx.claims.length} verified claims</span><span>${ctx.dropped.length} excluded</span><span>${Math.max(1, Math.round(words / 220))} min read</span><span class="badge">Every claim quoted from its source</span></div>`;
  const anchor = article.querySelector(".dek") ?? article.querySelector("h1");
  if (anchor) anchor.insertAdjacentHTML("afterend", stats);

  article.querySelector("ol.takeaways, ul.takeaways")?.classList.add("takeaways");

  // Sections: numbered heading, body column, margin notes built from the cites.
  article.querySelectorAll("section").forEach((sec, i) => {
    sec.classList.add("r-section");
    sec.querySelectorAll(".r-notes").forEach((n) => n.remove());
    let bodyCol = sec.querySelector(".r-body");
    if (!bodyCol) {
      sec.set_content(`<div class="r-body">${sec.innerHTML}</div>`, PARSE);
      bodyCol = sec.querySelector(".r-body")!;
    }
    const h2 = bodyCol.querySelector("h2");
    if (h2) {
      const head = h2.closest(".r-head");
      const n = String(i + 1).padStart(2, "0");
      if (head) head.querySelector(".num")?.set_content(n);
      else h2.replaceWith(`<div class="r-head"><span class="num">${n}</span>${h2.toString()}</div>`);
    }
    bodyCol.querySelectorAll("blockquote").forEach((bq) => {
      const src = bq.getAttribute("data-src");
      if (!bq.querySelector("p")) bq.set_content(`<p>${bq.innerHTML}</p>`, PARSE);
      bq.querySelectorAll("cite").forEach((c) => c.remove());
      const s = src && ctx.sources.get(src);
      if (s) bq.insertAdjacentHTML("beforeend", `<cite>${esc(s.title ?? host(s.url))}</cite>`);
    });
    const ids = [...new Set(bodyCol.querySelectorAll("sup.cite").map((s) => s.getAttribute("data-src")!))];
    if (ids.length) {
      const notes = ids
        .map((id) => {
          const s = ctx.sources.get(id)!;
          const q = quoteFor(id);
          return `<div class="note" data-src="${id}"><span class="n">${num(id)} · ${esc(host(s.url))}</span><span class="t">${esc(s.title ?? s.url)}</span>${q ? `<span class="q">“${esc(q)}”</span>` : ""}</div>`;
        })
        .join("");
      sec.insertAdjacentHTML("beforeend", `<aside class="r-notes">${notes}</aside>`);
    }
  });

  const oq = article.querySelector(".open-question");
  if (oq) {
    oq.querySelectorAll(".label").forEach((l) => l.remove());
    if (!oq.querySelector("p")) oq.set_content(`<p>${oq.innerHTML}</p>`, PARSE);
    oq.insertAdjacentHTML("afterbegin", `<span class="label">Open question</span>`);
  }

  // Sources list and the excluded-claim note are always generated from the board.
  const list = order
    .map((id) => {
      const s = ctx.sources.get(id)!;
      return `<li data-src="${id}"><span class="n">${num(id)}</span><span>${esc(s.title ?? host(s.url))} <span class="url">${esc(s.url)}</span></span></li>`;
    })
    .join("");
  const excluded = ctx.dropped
    .map((c) => `<p class="excluded">Excluded: “${esc(c.text)}” The quoted text was not found in the fetched source.</p>`)
    .join("");
  if (list || excluded) {
    article.insertAdjacentHTML(
      "beforeend",
      `<footer class="r-sources"><span class="label">Sources</span><ol>${list}</ol>${excluded}</footer>`
    );
  }

  assignIds(article, (el) => {
    if (el.closest(".r-meta, .r-stats, .r-notes, .r-sources")) return null;
    if (el.classList.contains("open-question")) return "oq";
    if (el.closest(".open-question") || el.closest("blockquote") && el.tagName !== "BLOCKQUOTE") return null;
    // A <li> in .milestones wraps its own h4/p children, which are targets in
    // their own right — tagging the <li> too would let an edit to it wipe out
    // that nested structure (see the same non-issue for plain-text list items).
    if (el.tagName === "LI" && el.closest(".milestones")) return null;
    if (el.tagName === "H1") return "title";
    if (el.classList.contains("dek")) return "dek";
    if (el.tagName === "LI" && el.closest(".takeaways")) return "t";
    if (el.tagName === "H2" || el.tagName === "H3" || el.tagName === "H4") return "h";
    if (el.tagName === "BLOCKQUOTE") return "pq";
    return "p";
  });

  const head = root.querySelector("head")!;
  head.querySelectorAll("#ds-house, link[data-ds-fonts]").forEach((n) => n.remove());
  const dsHref = googleFontsHref(ctx.designSystem);
  head.insertAdjacentHTML(
    "beforeend",
    `<link data-ds-fonts rel="stylesheet" href="${REPORT_FONTS_HREF}">${
      dsHref ? `<link data-ds-fonts rel="stylesheet" href="${dsHref}">` : ""
    }${styleBlock(ctx.designSystem)}`
  );
}

/**
 * Every non-magazineReport template's path: the Writer keeps full control of
 * its own markup and <style> (a slide deck, a wireframe, a diagram — none of
 * these fit the report layout), but if it cited anything, those citations
 * still get numbered and a small sources footer gets appended so a claim
 * pulled from a search is never left unattributed just because the format
 * isn't "Research".
 */
function finalizeLight(root: HTMLElement, ctx: ArtifactContext) {
  const body = root.querySelector("body")!;
  const order = numberCitations(body, ctx);
  if (order.length) {
    const list = order
      .map((id) => {
        const s = ctx.sources.get(id)!;
        return `<li data-src="${id}"><span class="n">${order.indexOf(id) + 1}</span><span>${esc(s.title ?? host(s.url))} <span class="url">${esc(s.url)}</span></span></li>`;
      })
      .join("");
    body.insertAdjacentHTML("beforeend", `<footer class="r-sources"><span class="label">Sources</span><ol>${list}</ol></footer>`);
    const head = root.querySelector("head")!;
    if (!head.querySelector("#cite-house")) head.insertAdjacentHTML("beforeend", `<style id="cite-house">${CITE_CSS}</style>`);
  }
  assignIds(body, (el) => {
    if (el.closest(".r-sources")) return null;
    return el.classList.contains("dek") || el.classList.contains("open-question") ? "e" : el.tagName === "H1" ? "title" : "e";
  });
}

/**
 * Runs on every write to an HTML artifact, for every template — any of them
 * can now search and cite. magazineReport templates get the full report
 * scaffolding (numbered citations, margin notes, sources list, stats) built
 * from the board, so the Writer only writes prose; every other template
 * keeps its own markup but still gets citations numbered and a sources
 * footer appended if it cited anything. Every template gets data-el ids for
 * the Inspector.
 */
export function finalizeArtifact(html: string, ctx: ArtifactContext): string {
  const root = ensureDocument(citeMarkup(html));
  const head = root.querySelector("head")!;
  if (!head.querySelector("meta[charset]")) head.insertAdjacentHTML("afterbegin", `<meta charset="utf-8">`);
  if (!head.querySelector("meta[name=viewport]"))
    head.insertAdjacentHTML("beforeend", `<meta name="viewport" content="width=device-width, initial-scale=1">`);

  if (ctx.magazineReport) finalizeResearch(root, ctx);
  else finalizeLight(root, ctx);

  const out = root.toString();
  return /^\s*<!doctype/i.test(out) ? out : `<!doctype html>\n${out}`;
}

/** Apply an Inspector edit (text and/or inline style) to one data-el element. */
export function applyElementEdit(
  html: string,
  id: string,
  edit: { text?: string; style?: { fontSize?: number; lineHeight?: number; marginBottom?: number } }
) {
  const root = parse(html, PARSE);
  const el = root.querySelector(`[data-el="${id.replace(/"/g, "")}"]`);
  if (!el) throw new Error(`element not found: ${id}`);
  if (edit.text != null) {
    if (el.querySelector("sup.cite") || el.getAttribute("data-src")) throw new Error("cited text can only be changed by the Writer");
    const label = el.classList.contains("open-question") ? el.querySelector(".label")?.toString() ?? "" : "";
    const target = el.classList.contains("open-question") || el.tagName === "BLOCKQUOTE" ? el.querySelector("p") ?? el : el;
    if (label && target === el) el.set_content(label + esc(edit.text));
    else target.set_content(esc(edit.text));
  }
  if (edit.style) {
    const decl = (el.getAttribute("style") ?? "")
      .split(";")
      .map((d) => d.trim())
      .filter((d) => d && !/^(font-size|line-height|margin-bottom)\s*:/i.test(d));
    const s = edit.style;
    if (s.fontSize != null) decl.push(`font-size:${Number(s.fontSize)}px`);
    if (s.lineHeight != null) decl.push(`line-height:${Number(s.lineHeight)}`);
    if (s.marginBottom != null) decl.push(`margin-bottom:${Number(s.marginBottom)}px`);
    el.setAttribute("style", decl.join(";"));
  }
  return root.toString();
}
