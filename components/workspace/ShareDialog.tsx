"use client";

import { useState } from "react";

const ACCESS = [
  { id: "private", l: "Private", sub: "Only you can open it" },
  { id: "view", l: "Anyone with the link can view", sub: "Read-only, citations stay clickable" },
  { id: "edit", l: "Anyone with the link can edit", sub: "They can comment and prompt the Writer" },
] as const;

export default function ShareDialog({
  projectId,
  title,
  access,
  isOwner,
  onAccessChange,
  onClose,
  onExport,
}: {
  projectId: string;
  title: string;
  access: string;
  isOwner: boolean;
  onAccessChange: (access: string) => void;
  onClose: () => void;
  onExport: (format: "pdf" | "html") => void;
}) {
  const [copied, setCopied] = useState(false);
  const [exp, setExp] = useState<Record<string, string>>({});
  const shareLink = typeof window !== "undefined" ? `${window.location.origin}/p/${projectId}` : `/p/${projectId}`;

  function copyLink() {
    if (access === "private") return;
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
          <div className="access-list">
            {ACCESS.map((a) => (
              <button
                key={a.id}
                className="access-item"
                disabled={!isOwner}
                onClick={() => {
                  onAccessChange(a.id);
                  setCopied(false);
                }}
                style={!isOwner ? { cursor: "default", opacity: 0.7 } : undefined}
              >
                <span className="access-radio" style={{ borderColor: access === a.id ? "var(--accent)" : "var(--line)" }}>
                  <span className="access-radio-dot" style={{ background: access === a.id ? "var(--accent)" : "transparent" }} />
                </span>
                <span className="access-text">
                  <span className="l">{a.l}</span>
                  <span className="sub">{a.sub}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="link-row" style={{ opacity: access === "private" ? 0.45 : 1 }}>
            <span className="link-box">{access === "private" ? "Link sharing is off" : shareLink}</span>
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
