/**
 * A quick wireframe of a plan, streamed to the canvas the moment the planning
 * step hands it in, so the canvas shows the shape of the design right away
 * instead of staying empty until the build step starts writing. The real file
 * replaces it as soon as it starts streaming.
 */
export function planPreviewHtml(plan: { title: string; summary: string; direction: string; sections: { name: string; detail: string }[] }): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const hexes = [...new Set((plan.direction.match(/#[0-9a-f]{6}\b/gi) ?? []).map((h) => h.toLowerCase()))].slice(0, 8);
  const lum = (h: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const sat = (h: string) => {
    const v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    return Math.max(...v) - Math.min(...v);
  };
  const bg = hexes.filter((h) => lum(h) > 0.85)[0] ?? "#faf8f5";
  const ink = hexes.filter((h) => lum(h) < 0.2)[0] ?? "#1f1d1a";
  const accent = [...hexes].sort((a, b) => sat(b) - sat(a)).find((h) => sat(h) > 60) ?? "#c96442";
  const swatches = hexes.map((h) => `<div class="sw"><i style="background:${h}"></i><span>${h}</span></div>`).join("");
  const sections = plan.sections
    .map(
      (s, i) => `<section class="blk${i === 0 ? " hero" : ""}"><div class="n">${String(i + 1).padStart(2, "0")}</div><h2>${esc(s.name)}</h2><p>${esc(s.detail)}</p></section>`
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(plan.title)}</title><style>
:root{--bg:${bg};--ink:${ink};--accent:${accent}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
.bar{position:sticky;top:0;display:flex;align-items:center;gap:10px;padding:10px 28px;background:var(--ink);color:var(--bg);font-size:13px;z-index:2}
.dot{width:8px;height:8px;border-radius:50%;background:var(--accent);animation:pulse 1.2s ease-in-out infinite}
@keyframes pulse{50%{opacity:.3}}
main{max-width:1100px;margin:0 auto;padding:40px 28px 80px}
h1{font:600 40px/1.1 Georgia,serif;margin:0 0 10px}.sum{max-width:720px;opacity:.75;margin:0 0 22px}
.dir{max-width:820px;font-size:13px;opacity:.7;margin:14px 0 28px}
.pal{display:flex;flex-wrap:wrap;gap:12px}.sw{display:flex;align-items:center;gap:8px;font:12px ui-monospace,monospace;opacity:.85}
.sw i{width:28px;height:28px;border-radius:8px;border:1px solid rgba(0,0,0,.12)}
.blk{position:relative;margin:14px 0;padding:26px 28px;border:1.5px dashed color-mix(in srgb,var(--ink) 30%,transparent);border-radius:14px;min-height:130px;overflow:hidden}
.blk::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--accent) 10%,transparent),transparent);transform:translateX(-100%);animation:sweep 2.4s ease-in-out infinite}
@keyframes sweep{to{transform:translateX(100%)}}
.hero{min-height:260px;border-color:var(--accent)}
.n{font:600 12px ui-monospace,monospace;color:var(--accent);letter-spacing:.1em}
.blk h2{font:600 22px/1.2 Georgia,serif;margin:6px 0 8px}.blk p{margin:0;max-width:760px;opacity:.75;font-size:14px}
</style></head><body><div class="bar"><span class="dot"></span>Planned layout. Building the real design now…</div><main>
<h1>${esc(plan.title)}</h1><p class="sum">${esc(plan.summary)}</p>${swatches ? `<div class="pal">${swatches}</div>` : ""}<p class="dir">${esc(plan.direction)}</p>${sections}
</main></body></html>`;
}

/** What the canvas shows the moment a new design starts, before there's a plan: the request and an animated skeleton. */
export function planningPlaceholderHtml(request: string, kind: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const ask = request.split("\n")[0].trim().slice(0, 160) || "Your design";
  const bars = [92, 64, 78, 40].map((w, i) => `<div class="ln" style="width:${w}%;animation-delay:${i * 0.15}s"></div>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Planning</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f4f0;color:#2a2723;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
.card{width:min(760px,90vw)}.k{font:600 11px/1 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:#a0522d;display:flex;align-items:center;gap:8px}
.dot{width:7px;height:7px;border-radius:50%;background:#a0522d;animation:p 1.1s ease-in-out infinite}@keyframes p{50%{opacity:.25}}
h1{font:500 30px/1.2 Georgia,serif;margin:14px 0 26px}
.hero{height:180px;border-radius:14px;margin-bottom:18px}.ln{height:14px;border-radius:7px;margin:12px 0}
.hero,.ln,.tile{background:linear-gradient(90deg,#e9e5de 0%,#f3f0ea 40%,#e9e5de 80%);background-size:200% 100%;animation:s 1.6s linear infinite}
@keyframes s{to{background-position:-200% 0}}.row{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:22px}.tile{height:110px;border-radius:12px}
</style></head><body><div class="card"><div class="k"><span class="dot"></span>Planning · ${esc(kind)}</div><h1>${esc(ask)}</h1><div class="hero"></div>${bars}<div class="row"><div class="tile"></div><div class="tile"></div><div class="tile"></div></div></div></body></html>`;
}
