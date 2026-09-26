import { parse, HTMLElement } from "node-html-parser";
import type { Source } from "@/lib/tools/tavily";

const PARSE = { comment: true, blockTextElements: { script: true, style: true, noscript: true, pre: true, textarea: true } };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const host = (u: string) => u.replace(/^https?:\/\//, "").split("/")[0];

/** Elements Edit mode can select and change; each gets a stable data-el id. */
const EDITABLE = "h1, h2, h3, h4, h5, h6, p, li, blockquote, figcaption, caption, td, th, dt, dd, button, a, label, small";

const CITE_CSS = `sup.cite{font:600 10px/1 ui-monospace,monospace;background:rgba(127,127,127,.18);padding:1px 4px;border-radius:4px;margin-left:2px;cursor:pointer}
#ds-sources{max-width:880px;margin:48px auto 32px;padding:16px 24px 0;border-top:1px solid rgba(127,127,127,.3);font:12px/1.5 ui-sans-serif,system-ui,sans-serif;opacity:.85}
#ds-sources .label{display:block;margin-bottom:8px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.7}
#ds-sources ol{margin:0;padding-left:20px}
#ds-sources .url{opacity:.6;word-break:break-all}`;

function ensureDocument(html: string) {
  let root = parse(html, PARSE);
  if (!root.querySelector("html")) root = parse(`<!doctype html><html><head></head><body>${html}</body></html>`, PARSE);
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

function inSvg(el: HTMLElement) {
  return !!el.closest("svg");
}

function assignIds(root: HTMLElement) {
  const used = new Set(root.querySelectorAll("[data-el]").map((e) => e.getAttribute("data-el")!));
  let n = 1;
  for (const el of root.querySelectorAll(EDITABLE)) {
    if (el.getAttribute("data-el") || inSvg(el) || el.closest("#ds-sources")) continue;
    while (used.has(`e${n}`)) n++;
    el.setAttribute("data-el", `e${n}`);
    used.add(`e${n}`);
  }
}

/** [S3] / [S3, S5] → numbered <sup class="cite">, plus a sources list for whatever was cited. */
function citations(root: HTMLElement, sources: Map<string, Source>) {
  const body = root.querySelector("body")!;
  body.querySelectorAll("#ds-sources").forEach((n) => n.remove());
  const walk = (node: HTMLElement) => {
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i];
      if (child instanceof HTMLElement) {
        if (!["SCRIPT", "STYLE", "TEXTAREA", "PRE", "CODE", "SVG"].includes(child.tagName)) walk(child);
      } else if (child.nodeType === 3 && /\[S\d+/.test(child.rawText)) {
        const html = child.rawText.replace(/\[(S\d+(?:\s*[,;]\s*S\d+)*)\]/g, (_m, ids: string) =>
          ids
            .split(/[,;]/)
            .map((id) => `<sup class="cite" data-src="${id.trim()}"></sup>`)
            .join("")
        );
        if (html === child.rawText) continue;
        const nodes = parse(html, PARSE).childNodes;
        for (const n of nodes) n.parentNode = node;
        node.childNodes.splice(i, 1, ...nodes);
        i += nodes.length - 1;
      }
    }
  };
  walk(body);

  const order: string[] = [];
  for (const sup of body.querySelectorAll("sup.cite")) {
    const id = sup.getAttribute("data-src") ?? "";
    if (!sources.has(id)) {
      sup.remove();
      continue;
    }
    if (!order.includes(id)) order.push(id);
    sup.set_content(String(order.indexOf(id) + 1));
  }
  const head = root.querySelector("head")!;
  head.querySelectorAll("#ds-cite-css").forEach((n) => n.remove());
  if (!order.length) return;
  const items = order
    .map((id) => {
      const s = sources.get(id)!;
      return `<li data-src="${id}">${esc(s.title || host(s.url))} <span class="url">${esc(s.url)}</span></li>`;
    })
    .join("");
  body.insertAdjacentHTML("beforeend", `<footer id="ds-sources"><span class="label">Sources</span><ol>${items}</ol></footer>`);
  head.insertAdjacentHTML("beforeend", `<style id="ds-cite-css">${CITE_CSS}</style>`);
}

/** Runs on every write of a design file. */
export function finalizeArtifact(html: string, sources: Map<string, Source>): string {
  const root = ensureDocument(html);
  const head = root.querySelector("head")!;
  if (!head.querySelector("meta[charset]")) head.insertAdjacentHTML("afterbegin", `<meta charset="utf-8">`);
  if (!head.querySelector("meta[name=viewport]"))
    head.insertAdjacentHTML("beforeend", `<meta name="viewport" content="width=device-width, initial-scale=1">`);
  citations(root, sources);
  assignIds(root);
  const out = root.toString();
  return /^\s*<!doctype/i.test(out) ? out : `<!doctype html>\n${out}`;
}

function sanitizeFragment(html: string) {
  const frag = parse(`<div>${html}</div>`, PARSE).querySelector("div")!;
  frag.querySelectorAll("script, style, iframe, object, embed, link, meta").forEach((n) => n.remove());
  for (const el of frag.querySelectorAll("*")) {
    for (const name of Object.keys(el.attributes)) {
      const v = el.getAttribute(name) ?? "";
      if (/^on/i.test(name) || (/^(href|src|xlink:href|action)$/i.test(name) && /^\s*javascript:/i.test(v))) el.removeAttribute(name);
    }
  }
  return frag.innerHTML;
}

export type ElementEdit = { id: string; html?: string; style?: Record<string, string | number> };

const STYLE_PROPS: Record<string, (v: string | number) => string> = {
  fontSize: (v) => `font-size:${Number(v)}px`,
  lineHeight: (v) => `line-height:${Number(v)}`,
  letterSpacing: (v) => `letter-spacing:${Number(v)}em`,
  marginBottom: (v) => `margin-bottom:${Number(v)}px`,
  fontWeight: (v) => `font-weight:${Number(v)}`,
  color: (v) => (/^#[0-9a-f]{3,8}$/i.test(String(v)) ? `color:${v}` : ""),
  textAlign: (v) => (/^(left|center|right|justify)$/.test(String(v)) ? `text-align:${v}` : ""),
};
const CSS_NAME: Record<string, string> = {
  fontSize: "font-size",
  lineHeight: "line-height",
  letterSpacing: "letter-spacing",
  marginBottom: "margin-bottom",
  fontWeight: "font-weight",
  color: "color",
  textAlign: "text-align",
};

/** Apply Edit-mode changes (inner HTML and/or a few inline styles) to data-el elements. */
export function applyElementEdits(html: string, edits: ElementEdit[]) {
  const root = parse(html, PARSE);
  for (const edit of edits) {
    const el = root.querySelector(`[data-el="${String(edit.id).replace(/[^\w-]/g, "")}"]`);
    if (!el) throw new Error(`element not found: ${edit.id}`);
    if (typeof edit.html === "string") el.set_content(sanitizeFragment(edit.html));
    if (edit.style) {
      const keys = Object.keys(edit.style).filter((k) => k in STYLE_PROPS);
      const drop = new Set(keys.map((k) => CSS_NAME[k]));
      const decl = (el.getAttribute("style") ?? "")
        .split(";")
        .map((d) => d.trim())
        .filter((d) => d && !drop.has(d.split(":")[0].trim().toLowerCase()));
      for (const k of keys) {
        const d = STYLE_PROPS[k](edit.style[k]);
        if (d) decl.push(d);
      }
      el.setAttribute("style", decl.join(";"));
    }
  }
  return root.toString();
}

export type TweakControl = {
  name: string;
  label?: string;
  type: "color" | "range" | "select" | "toggle" | "text";
  value: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: (string | { label: string; value: string })[];
};

/** Persist tweak values into the file's <script id="tweaks"> block so they survive reloads and exports. */
export function applyTweakValues(html: string, values: Record<string, unknown>) {
  const root = parse(html, PARSE);
  const block = root.querySelector('script#tweaks, script[data-tweaks]');
  if (!block) throw new Error("this file has no tweaks");
  const raw = JSON.parse(block.rawText || "[]");
  const list: TweakControl[] = Array.isArray(raw) ? raw : raw.controls ?? [];
  for (const c of list) if (c && c.name in values) c.value = values[c.name] as any;
  block.set_content(JSON.stringify(Array.isArray(raw) ? list : { ...raw, controls: list }, null, 1).replace(/</g, "\\u003c"));
  return root.toString();
}
