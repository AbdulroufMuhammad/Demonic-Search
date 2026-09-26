import type { TweakControl } from "@/lib/finalize";

/**
 * Injected into every design shown on the canvas. The iframe is sandboxed
 * without allow-same-origin, so this script is the only channel between the
 * design and the app: it reports picks/edits/tweak definitions out, and
 * applies modes, styles, tweak values and streaming drafts coming in.
 * Highlight boxes live on <html>, outside <body>, so they never end up in
 * an element's saved HTML.
 */
const BRIDGE = String.raw`(function(){
  if (window.__dsBridge) return; window.__dsBridge = 1;
  var root = document.documentElement;
  function post(m){ m.__ds = 1; try { parent.postMessage(m, "*"); } catch (e) {} }
  var mode = "view", editing = null, editTimer = null, lastSent = "";
  var style = document.createElement("style");
  style.setAttribute("data-ds-bridge", "");
  function mkBox(solid){
    var b = document.createElement("div");
    b.setAttribute("data-ds-bridge", "");
    b.style.cssText = "position:fixed;pointer-events:none;z-index:2147483647;border-radius:3px;display:none;box-sizing:border-box;" +
      (solid ? "border:2px solid #d9774f;background:rgba(217,119,87,.06)" : "border:1.5px dashed #d9774f");
    return b;
  }
  var hoverBox = mkBox(false), selBox = mkBox(true), selEl = null, hoverEl = null;
  function mount(){
    if (!style.isConnected) (document.head || root).appendChild(style);
    if (!hoverBox.isConnected) root.appendChild(hoverBox);
    if (!selBox.isConnected) root.appendChild(selBox);
  }
  function place(box, el){
    if (!el || !el.isConnected) { box.style.display = "none"; return; }
    var r = el.getBoundingClientRect();
    box.style.display = "block";
    box.style.left = (r.left - 3) + "px"; box.style.top = (r.top - 3) + "px";
    box.style.width = (r.width + 6) + "px"; box.style.height = (r.height + 6) + "px";
  }
  function repaint(){ place(hoverBox, mode === "view" ? null : hoverEl); place(selBox, mode === "view" ? null : selEl); }
  addEventListener("scroll", repaint, true); addEventListener("resize", repaint);
  function paintMode(){
    style.textContent = mode === "comment" ? "*{cursor:crosshair!important}" : mode === "edit" ? "[data-el]{cursor:text!important}" : "";
    repaint();
  }
  function rectOf(el){ var r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
  function hex(c){
    var m = String(c).match(/\d+(\.\d+)?/g); if (!m || m.length < 3) return "#000000";
    return "#" + [0,1,2].map(function(i){ return ("0" + Math.round(+m[i]).toString(16)).slice(-2); }).join("");
  }
  function targetFor(t){
    if (!t || t.nodeType !== 1) t = t && t.parentElement;
    if (!t || t === root || t === document.body || t.hasAttribute("data-ds-bridge")) return null;
    return mode === "edit" ? t.closest("[data-el]") : t;
  }
  function stopEditing(){
    if (!editing) return;
    flush();
    editing.removeAttribute("contenteditable");
    editing = null;
  }
  function flush(){
    clearTimeout(editTimer);
    if (!editing) return;
    var html = editing.innerHTML;
    if (html !== lastSent) { lastSent = html; post({ t: "html", id: editing.getAttribute("data-el"), html: html }); }
  }
  document.addEventListener("mouseover", function(e){
    if (mode === "view") return;
    hoverEl = targetFor(e.target); repaint();
  }, true);
  document.addEventListener("click", function(e){
    var cite = e.target.closest && e.target.closest("sup.cite[data-src], #ds-sources li[data-src]");
    if (mode === "view") {
      if (cite) { e.preventDefault(); post({ t: "cite", src: cite.getAttribute("data-src") }); return; }
      var a = e.target.closest && e.target.closest("a[href]");
      if (a) {
        var href = a.getAttribute("href") || "";
        if (href.charAt(0) === "#") return;
        if (/^https?:/i.test(href)) { e.preventDefault(); window.open(href, "_blank", "noopener"); }
      }
      return;
    }
    var el = targetFor(e.target);
    if (!el || (editing && editing.contains(e.target))) return;
    e.preventDefault(); e.stopPropagation();
    stopEditing();
    selEl = el; repaint();
    if (mode === "comment") {
      var text = (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ");
      post({ t: "pick", id: el.getAttribute("data-el"), tag: el.tagName.toLowerCase(), text: text.slice(0, 200), html: el.outerHTML.slice(0, 1500), rect: rectOf(el) });
    } else {
      var cs = getComputedStyle(el), fs = parseFloat(cs.fontSize) || 16;
      var lh = cs.lineHeight === "normal" ? 1.2 : Math.round(parseFloat(cs.lineHeight) / fs * 100) / 100;
      var ls = cs.letterSpacing === "normal" ? 0 : Math.round(parseFloat(cs.letterSpacing) / fs * 1000) / 1000;
      post({ t: "select", id: el.getAttribute("data-el"), tag: el.tagName.toLowerCase(), rect: rectOf(el), style: {
        fontSize: Math.round(fs), lineHeight: lh, letterSpacing: ls, marginBottom: Math.round(parseFloat(cs.marginBottom) || 0),
        fontWeight: parseInt(cs.fontWeight, 10) || 400, color: hex(cs.color), textAlign: cs.textAlign === "start" ? "left" : cs.textAlign
      }});
      editing = el; lastSent = el.innerHTML;
      el.setAttribute("contenteditable", "true");
      el.focus();
    }
  }, true);
  document.addEventListener("input", function(e){
    if (!editing || !editing.contains(e.target)) return;
    clearTimeout(editTimer); editTimer = setTimeout(flush, 500); repaint();
  }, true);
  document.addEventListener("focusout", function(e){ if (editing && e.target === editing) flush(); }, true);
  document.addEventListener("keydown", function(e){
    if (e.key === "Escape" && mode !== "view") { stopEditing(); selEl = null; repaint(); post({ t: "escape" }); }
  }, true);

  var controls = [];
  function kebab(s){ return String(s).replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase(); }
  function applyTweak(c, v, fire){
    var css = c.type === "toggle" ? (v ? "1" : "0") : (typeof v === "number" || c.type === "range") ? v + (c.unit || "") : String(v);
    root.style.setProperty("--" + c.name, css);
    root.setAttribute("data-" + kebab(c.name), String(v));
    if (fire) { try { window.dispatchEvent(new CustomEvent("tweak", { detail: { name: c.name, value: v } })); } catch (e) {} }
  }
  function readTweaks(){
    var s = document.querySelector("script#tweaks, script[data-tweaks]");
    if (!s) return [];
    try { var raw = JSON.parse(s.textContent || "[]"); var list = Array.isArray(raw) ? raw : (raw.controls || []); return list.filter(function(c){ return c && c.name; }); }
    catch (e) { return []; }
  }
  function pages(){ return document.querySelectorAll(".page, .slide, [data-page]").length; }

  addEventListener("message", function(e){
    if (e.source !== parent || !e.data || !e.data.__ds) return;
    var m = e.data;
    if (m.t === "mode") {
      if (m.mode !== mode) { stopEditing(); selEl = null; hoverEl = null; }
      mode = m.mode; paintMode();
    } else if (m.t === "deselect") { stopEditing(); selEl = null; repaint(); }
    else if (m.t === "style" && m.id) {
      var el = document.querySelector('[data-el="' + String(m.id).replace(/[^\w-]/g, "") + '"]');
      if (!el) return;
      var s = m.style || {};
      if (s.fontSize != null) el.style.fontSize = s.fontSize + "px";
      if (s.lineHeight != null) el.style.lineHeight = s.lineHeight;
      if (s.letterSpacing != null) el.style.letterSpacing = s.letterSpacing + "em";
      if (s.marginBottom != null) el.style.marginBottom = s.marginBottom + "px";
      if (s.fontWeight != null) el.style.fontWeight = s.fontWeight;
      if (s.color != null) el.style.color = s.color;
      if (s.textAlign != null) el.style.textAlign = s.textAlign;
      repaint();
    } else if (m.t === "tweaks") {
      var vals = m.values || {};
      controls.forEach(function(c){ if (c.name in vals) applyTweak(c, vals[c.name], true); });
    } else if (m.t === "draft") {
      var doc = new DOMParser().parseFromString(m.html, "text/html");
      if (doc.head.innerHTML !== (window.__dsHead || "")) { window.__dsHead = doc.head.innerHTML; document.head.innerHTML = doc.head.innerHTML; }
      document.body.innerHTML = doc.body.innerHTML;
      document.body.setAttribute("style", doc.body.getAttribute("style") || "");
      document.body.className = doc.body.className;
      mount();
      post({ t: "height", h: document.documentElement.scrollHeight });
    }
  });

  function init(){
    mount(); paintMode();
    controls = readTweaks();
    controls.forEach(function(c){ applyTweak(c, c.value, false); });
    post({ t: "ready", pages: pages(), tweaks: controls, title: document.title || "" });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  addEventListener("load", function(){
    setTimeout(function(){ controls.forEach(function(c){ applyTweak(c, c.value, true); }); post({ t: "pages", pages: pages() }); }, 0);
  });
})();`;

export function buildSrcDoc(html: string) {
  const tag = `<script data-ds-bridge>${BRIDGE}</script>`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${tag}</body>`);
  return html + tag;
}

export const DRAFT_SHELL = buildSrcDoc("<!doctype html><html><head><meta charset=\"utf-8\"></head><body></body></html>");

export type BridgeOut =
  | { t: "ready"; pages: number; tweaks: TweakControl[]; title: string }
  | { t: "pages"; pages: number }
  | { t: "pick"; id: string | null; tag: string; text: string; html: string; rect: Rect }
  | { t: "select"; id: string; tag: string; rect: Rect; style: ElementStyle }
  | { t: "html"; id: string; html: string }
  | { t: "cite"; src: string }
  | { t: "escape" }
  | { t: "height"; h: number };

export type Rect = { x: number; y: number; w: number; h: number };
export type ElementStyle = {
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  marginBottom: number;
  fontWeight: number;
  color: string;
  textAlign: string;
};
export type CanvasMode = "view" | "comment" | "edit";
