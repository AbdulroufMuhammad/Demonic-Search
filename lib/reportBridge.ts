/**
 * The canvas renders the artifact in a sandboxed iframe (srcdoc, so no
 * network origin is shared with the app). This script is injected into
 * every HTML artifact before it's shown, and talks to ReportCanvas over
 * postMessage so Inspect mode and citation clicks work without breaking the
 * sandbox. Messages in ({t:"inspect"|"select"|"style"|"text"}) mirror the
 * BridgeIn type in ReportCanvas.tsx; messages out ({t:"ready"|"cite"|"select"}) mirror BridgeOut.
 */
const BRIDGE_SCRIPT = `
(function(){
  function post(msg){ try{ window.parent.postMessage(msg, "*"); }catch(e){} }
  var inspecting = false, selected = null;
  var style = document.createElement("style");
  style.id = "ds-bridge-style";
  document.head.appendChild(style);
  function paintStyle(){
    style.textContent = inspecting
      ? "[data-el]{cursor:pointer}[data-el]:hover{outline:2px solid rgba(200,245,66,.5);outline-offset:6px}"
        + (selected ? "[data-el=\\"" + selected.replace(/"/g,"") + "\\"]{outline:2px solid #c8f542!important;outline-offset:6px;background:rgba(200,245,66,.12)}" : "")
      : "";
  }
  window.addEventListener("message", function(e){
    if (e.source !== window.parent || !e.data || typeof e.data !== "object") return;
    var m = e.data;
    if (m.t === "inspect") { inspecting = !!m.on; if(!inspecting) selected=null; paintStyle(); }
    else if (m.t === "select") { selected = m.id || null; paintStyle(); }
    else if (m.t === "style" && m.id) {
      var el = document.querySelector('[data-el="' + m.id.replace(/"/g,"") + '"]');
      if (el && m.style) {
        if (m.style.fontSize != null) el.style.fontSize = m.style.fontSize + "px";
        if (m.style.lineHeight != null) el.style.lineHeight = m.style.lineHeight;
        if (m.style.marginBottom != null) el.style.marginBottom = m.style.marginBottom + "px";
      }
    } else if (m.t === "text" && m.id) {
      var el2 = document.querySelector('[data-el="' + m.id.replace(/"/g,"") + '"]');
      if (el2) {
        var label = el2.querySelector(".label");
        var target = el2.querySelector(".label") ? el2.querySelector("p") : (el2.tagName === "BLOCKQUOTE" ? el2.querySelector("p") : el2);
        if (target) target.textContent = m.text;
      }
    }
  });
  document.addEventListener("click", function(e){
    var srcEl = e.target.closest && e.target.closest("[data-src]");
    if (srcEl) { e.preventDefault(); e.stopPropagation(); post({t:"cite", src: srcEl.getAttribute("data-src")}); return; }
    if (!inspecting) return;
    var el = e.target.closest && e.target.closest("[data-el]");
    if (!el) return;
    e.preventDefault(); e.stopPropagation();
    var cs = window.getComputedStyle(el);
    var fs = parseFloat(cs.fontSize) || 16;
    var lhRaw = cs.lineHeight;
    var lh = lhRaw === "normal" ? 1.4 : (lhRaw.indexOf("px") > -1 ? Math.round((parseFloat(lhRaw) / fs) * 100) / 100 : parseFloat(lhRaw) || 1.4);
    var mb = parseFloat(cs.marginBottom) || 0;
    var label = el.querySelector(".label");
    var textTarget = label ? el.querySelector("p") : (el.tagName === "BLOCKQUOTE" ? el.querySelector("p") : el);
    var locked = !!el.querySelector("sup.cite") || el.hasAttribute("data-src");
    post({
      t: "select", id: el.getAttribute("data-el"), tag: el.tagName.toLowerCase(),
      text: textTarget ? textTarget.textContent || "" : "",
      fs: Math.round(fs), lh: lh, mb: Math.round(mb), locked: locked
    });
  }, true);
  post({t:"ready"});
})();
`;

export function buildSrcDoc(html: string): string {
  const script = `<script>${BRIDGE_SCRIPT}</script>`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${script}</body>`);
  return html + script;
}

export type BridgeOut =
  | { t: "ready" }
  | { t: "cite"; src: string }
  | { t: "select"; id: string; tag: string; text: string; fs: number; lh: number; mb: number; locked: boolean };
export type BridgeIn =
  | { t: "inspect"; on: boolean }
  | { t: "select"; id: string | null }
  | { t: "style"; id: string; style: { fontSize?: number; lineHeight?: number; marginBottom?: number } }
  | { t: "text"; id: string; text: string };
