/**
 * The house stylesheet for Research reports. It is injected into index.html
 * by finalizeArtifact on every write, so the Writer only produces semantic
 * markup and the layout stays consistent. Design-system tokens override the
 * variables in :root.
 */
export const REPORT_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;0,8..60,600;1,8..60,400&display=swap";

/**
 * Minimal, self-contained citation styling for every non-magazineReport
 * template (see lib/report/finalize.ts's finalizeLight). Unlike REPORT_CSS
 * below, this can't assume --paper/--ink/--accent exist — those templates'
 * Writers hand-style their own page — so it uses fixed neutral tones instead
 * of the theme variables, and only appears at all when something was
 * actually cited.
 */
export const CITE_CSS = `
sup.cite{font-family:ui-monospace,monospace;font-size:10px;font-weight:600;font-style:normal;background:#e8e8e8;color:#111;padding:1px 5px;border-radius:4px;margin-left:2px;line-height:1}
.r-sources{margin-top:40px;padding-top:16px;border-top:1px solid #ddd;font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;color:#444}
.r-sources .label{display:block;margin-bottom:8px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#888}
.r-sources ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.r-sources li{display:flex;gap:8px}
.r-sources .n{color:#888;font-family:ui-monospace,monospace}
.r-sources .url{color:#888;word-break:break-all}
`;

export const REPORT_CSS = `
:root{--paper:#f6f4ee;--ink:#1b1b18;--accent:#c8f542;
--font-text:'Source Serif 4',Georgia,serif;--font-heading:var(--font-text);--font-ui:Geist,ui-sans-serif,system-ui,sans-serif;--font-mono:'Geist Mono',ui-monospace,monospace}
:root{
/* Secondary tones are derived from ink/paper, so a swapped design system (or any user override
   of just --paper/--ink/--accent) keeps readable contrast without restating every shade. */
--muted:color-mix(in srgb,var(--ink) 55%,var(--paper));
--soft:color-mix(in srgb,var(--ink) 74%,var(--paper));
--rule:color-mix(in srgb,var(--ink) 12%,var(--paper));
--dash:color-mix(in srgb,var(--ink) 30%,var(--paper));
--hl:color-mix(in srgb,var(--accent) 32%,var(--paper));
}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:var(--paper);color:var(--ink);-webkit-font-smoothing:antialiased}
.report{max-width:940px;margin:0 auto;background:var(--paper);color:var(--ink);padding:clamp(28px,6%,72px) clamp(22px,7%,72px) 64px;font-family:var(--font-text)}
.r-meta{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;white-space:nowrap;font-family:var(--font-mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);padding-bottom:18px;border-bottom:1px solid var(--ink)}
.report h1{margin:44px 0 18px;font-weight:500;font-size:54px;line-height:1.04;letter-spacing:-.025em;max-width:680px;text-wrap:balance;font-family:var(--font-heading)}
.report .dek{margin:0;font-size:21px;line-height:1.45;font-style:italic;color:var(--soft);max-width:600px;text-wrap:pretty}
.r-stats{display:flex;flex-wrap:wrap;align-items:center;gap:8px 18px;margin-top:28px;font-family:var(--font-ui);font-size:13px;color:var(--muted)}
.r-stats span{white-space:nowrap}
.r-stats .badge{background:var(--hl);color:var(--ink);border-radius:999px;padding:3px 10px;font-size:12px}
.takeaways{list-style:none;margin:48px 0 8px;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));border-top:1px solid var(--ink);border-bottom:1px solid var(--rule);counter-reset:tk}
.takeaways li{counter-increment:tk;padding:20px 20px 22px 0;font-family:var(--font-ui);font-size:16px;line-height:1.45;font-weight:500;text-wrap:pretty}
.takeaways li::before{content:"0" counter(tk);display:block;margin-bottom:10px;font-family:var(--font-mono);font-size:11px;font-weight:400;color:var(--muted)}
.r-section{display:flex;flex-wrap:wrap;gap:20px 48px;padding-top:44px}
.r-body{flex:1 1 360px;min-width:0}
.r-head{display:flex;align-items:baseline;gap:14px;margin-bottom:16px}
.r-head .num{font-family:var(--font-mono);font-size:12px;color:var(--muted)}
.report h2{margin:0;font-weight:500;font-size:30px;line-height:1.15;letter-spacing:-.015em;font-family:var(--font-heading)}
.r-body p,.r-body li{margin:0 0 16px;font-size:18px;line-height:1.65;text-wrap:pretty}
.r-body ul,.r-body ol{margin:0 0 16px;padding-left:22px}
.report blockquote{margin:28px 0 8px;padding:4px 0 4px 24px;border-left:3px solid var(--accent)}
.report blockquote p{display:block;margin:0;font-size:27px;line-height:1.3;font-style:italic;letter-spacing:-.01em}
.report blockquote cite{display:block;margin-top:10px;font-family:var(--font-ui);font-style:normal;font-size:12px;color:var(--muted)}
.r-notes{flex:0 1 220px;min-width:180px;display:flex;flex-direction:column;gap:12px;padding-top:6px}
.note{font-family:var(--font-ui);border-top:2px solid var(--rule);padding-top:10px;display:flex;flex-direction:column;gap:4px;cursor:pointer}
.note .n{font-family:var(--font-mono);font-size:11px;color:var(--muted)}
.note .t{font-size:13px;line-height:1.35;font-weight:500}
.note .q{font-family:var(--font-text);font-style:italic;font-size:13px;line-height:1.4;color:var(--soft)}
sup.cite{font-family:var(--font-mono);font-size:10px;font-weight:500;font-style:normal;background:var(--hl);color:var(--ink);padding:1px 5px;border-radius:4px;margin-left:3px;cursor:pointer;line-height:1}
.open-question{margin-top:52px;border:1px dashed var(--dash);border-radius:6px;padding:20px 22px;display:flex;flex-wrap:wrap;gap:10px 28px}
.open-question .label{font-family:var(--font-mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);padding-top:4px}
.open-question p{flex:1 1 300px;margin:0;font-size:18px;line-height:1.55;text-wrap:pretty}
.r-sources{margin-top:56px;padding-top:18px;border-top:1px solid var(--ink);font-family:var(--font-ui);display:flex;flex-direction:column;gap:10px}
.r-sources .label{font-family:var(--font-mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.r-sources ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.r-sources li{display:grid;grid-template-columns:28px minmax(0,1fr);gap:8px;font-size:13px;line-height:1.45;cursor:pointer}
.r-sources .n{font-family:var(--font-mono);color:var(--muted)}
.r-sources .url{color:var(--muted);word-break:break-all}
.r-sources .excluded{font-size:12px;color:var(--muted);margin:8px 0 0;line-height:1.5}

/* --- Content blocks: Writer-authored, used only where they fit the request. --- */

.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:0;margin:28px 0;border-top:1px solid var(--ink);border-bottom:1px solid var(--rule)}
.stat-card{padding:18px 20px 20px 0;border-left:1px solid var(--rule)}
.stat-card:first-child{border-left:none}
.stat-num{display:block;font-family:var(--font-heading);font-size:36px;line-height:1.1;letter-spacing:-.01em;font-weight:500}
.stat-label{display:block;margin-top:6px;font-family:var(--font-ui);font-size:13px;line-height:1.4;color:var(--muted)}

.data-table{margin:28px 0;overflow-x:auto}
.data-table table{width:100%;border-collapse:collapse;font-family:var(--font-ui);font-size:14px}
.data-table th{text-align:left;font-size:11px;letter-spacing:.06em;text-transform:uppercase;font-weight:500;color:var(--muted);padding:0 12px 10px 0;border-bottom:1px solid var(--ink)}
.data-table td{padding:12px 12px 12px 0;border-bottom:1px solid var(--rule);line-height:1.5;vertical-align:top}
.data-table tr:last-child td{border-bottom:1px solid var(--ink)}
.data-table td:first-child,.data-table th:first-child{padding-left:0}

.tag{display:inline-block;font-family:var(--font-ui);font-size:11px;line-height:1;letter-spacing:.02em;padding:4px 9px;border-radius:999px;white-space:nowrap}
.tag[data-tone="accent"]{background:var(--hl);color:var(--ink)}
.tag[data-tone="outline"],.tag:not([data-tone]){background:none;color:var(--soft);border:1px solid var(--dash)}
.tag[data-tone="muted"]{background:none;color:var(--muted)}

.callout{margin:32px 0;padding:18px 22px;border-radius:4px;border-left:4px solid var(--accent);background:color-mix(in srgb,var(--accent) 9%,var(--paper))}
.callout[data-tone="neutral"]{border-left-color:var(--dash);background:color-mix(in srgb,var(--ink) 5%,var(--paper))}
.callout-label{font-family:var(--font-mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 8px}
.callout p{margin:0 0 10px;font-size:16px;line-height:1.55}
.callout p:last-child{margin-bottom:0}

.milestones{list-style:none;margin:32px 0;padding:0;border-top:1px solid var(--rule)}
.milestones li{position:relative;padding:18px 0 18px 84px;border-bottom:1px solid var(--rule)}
.m-when{position:absolute;left:0;top:19px;font-family:var(--font-mono);font-size:11px;color:var(--muted);width:70px;line-height:1.4}
.milestones h4{margin:0 0 6px;font-family:var(--font-ui);font-size:16px;font-weight:600;letter-spacing:-.005em}
.milestones p{margin:0 0 6px;font-size:15px;line-height:1.55}
.milestones p:last-child{margin-bottom:0}
.m-done{font-family:var(--font-ui);font-size:13px;color:var(--soft)}
.m-done strong{color:var(--ink);font-weight:600}

.risk-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1px;background:var(--rule);margin:32px 0;border:1px solid var(--rule)}
.risk-card{background:var(--paper);padding:18px 20px}
.risk-card h4{margin:0 0 8px;font-family:var(--font-ui);font-size:15px;font-weight:600;letter-spacing:-.005em}
.risk-card p{margin:0 0 10px;font-size:14px;line-height:1.55}
.risk-card p:last-child{margin-bottom:0}
.risk-card .fix{font-family:var(--font-ui);font-size:13px;color:var(--soft)}
.risk-card .fix strong{color:var(--ink);font-weight:600}

.code-block{margin:28px 0;border-radius:6px;overflow:hidden;background:var(--ink)}
.code-block .cb-bar{display:flex;justify-content:space-between;gap:12px;padding:9px 16px;font-family:var(--font-mono);font-size:11px;letter-spacing:.03em;color:color-mix(in srgb,var(--paper) 55%,var(--ink))}
.code-block pre{margin:0;padding:4px 16px 18px;overflow-x:auto}
.code-block code{font-family:var(--font-mono);font-size:13px;line-height:1.6;color:color-mix(in srgb,var(--paper) 92%,var(--ink))}

.figure{margin:32px 0}
.figure-media{border:1px solid var(--rule);border-radius:4px;padding:20px;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--ink) 3%,var(--paper))}
.figure-media svg{max-width:100%;height:auto;display:block}
.figure figcaption{margin-top:10px;font-family:var(--font-mono);font-size:11px;color:var(--muted);text-align:left}

@page{size:A4;margin:14mm}
@media print{.report{padding:0;max-width:none}.r-section{break-inside:avoid-page}}
@media (max-width:640px){.report h1{font-size:38px}.report h2{font-size:24px}.report blockquote p{font-size:22px}.risk-grid{grid-template-columns:1fr}.milestones li{padding-left:0;padding-top:34px}.m-when{position:static;display:block;width:auto;margin-bottom:6px}}
`;
