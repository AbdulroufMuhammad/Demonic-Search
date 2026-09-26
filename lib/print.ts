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

/**
 * Download a design as a PDF printed on the server by the same Chromium the
 * automatic check uses, so the file matches the page count the agent verified
 * (and has no browser headers or footers). Falls back to the print dialog.
 */
export async function downloadPdf(projectId: string, path: string, fallbackHtml?: string | null): Promise<void> {
  try {
    const res = await fetch(`/api/projects/${projectId}/export?format=pdf&path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error(String(res.status));
    const url = URL.createObjectURL(await res.blob());
    Object.assign(document.createElement("a"), { href: url, download: `${path.replace(/\.html$/i, "")}.pdf` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch {
    let html = fallbackHtml;
    if (!html) {
      const res = await fetch(`/api/projects/${projectId}/file?path=${encodeURIComponent(path)}`);
      if (res.ok) html = (await res.json()).content;
    }
    if (html) printHtml(html);
  }
}
