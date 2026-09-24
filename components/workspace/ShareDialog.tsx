"use client";

import { useState } from "react";

export default function ShareDialog({
  projectId,
  title,
  onClose,
  onExport,
}: {
  projectId: string;
  title: string;
  onClose: () => void;
  onExport: (format: "pdf" | "html") => void;
}) {
  const [copied, setCopied] = useState(false);
  const [exp, setExp] = useState<Record<string, string>>({});
  const shareLink = typeof window !== "undefined" ? `${window.location.origin}/p/${projectId}` : `/p/${projectId}`;

  function copyLink() {
    navigator.clipboard?.writeText(shareLink).catch(() => {});
    setCopied(true);
  }

  function doExport(id: "pdf" | "html" | "pptx") {
    if (id === "pptx") return;
    setExp((e) => ({ ...e, [id]: "Rendering…" }));
    onExport(id);
    setTimeout(() => setExp((e) => ({ ...e, [id]: "Downloaded ✓" })), 900);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-body">
          <div className="modal-head">
            <span className="modal-title">Share &ldquo;{title}&rdquo;</span>
            <button className="drawer-close" onClick={onClose}>
              ×
            </button>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
            Anyone with this link can open a read-only view of the report — citations stay clickable. The workspace
            itself (chat, board, inspect) is open to anyone with its own link too.
          </p>
          <div className="link-row">
            <span className="link-box">{shareLink}</span>
            <button className="btn-copy" onClick={copyLink}>
              {copied ? "Copied ✓" : "Copy link"}
            </button>
          </div>
        </div>
        <div className="modal-exports">
          <span className="export-label">Export</span>
          {[
            { id: "pdf" as const, label: "PDF", sub: "Print layout from the page's @page rule" },
            { id: "html" as const, label: "Standalone HTML", sub: "One file, fonts and images inlined" },
            { id: "pptx" as const, label: "Summary deck", sub: "PPTX export is not built yet" },
          ].map((x) => (
            <div key={x.id} className="export-row" style={{ opacity: x.id === "pptx" ? 0.45 : 1 }}>
              <div className="info">
                <span className="label">{x.label}</span>
                <span className="sub">{x.sub}</span>
              </div>
              <button className="btn-export" disabled={x.id === "pptx"} onClick={() => doExport(x.id)}>
                {x.id === "pptx" ? "Soon" : exp[x.id] ?? "Export"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
