/**
 * PDF export without a server-side browser: load the design into a hidden,
 * sandboxed iframe and open the browser's print dialog for just that frame,
 * where "Save as PDF" is one click. Designs carry their own @page rules.
 */
export function printHtml(html: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts allow-modals");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none";
  const trigger = `<script>addEventListener("load",function(){setTimeout(function(){print()},600)});<\/script>`;
  frame.srcdoc = /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${trigger}</body>`) : html + trigger;
  document.body.appendChild(frame);
  setTimeout(() => frame.remove(), 5 * 60_000);
}
