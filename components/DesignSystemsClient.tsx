"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { DesignSystem } from "@/lib/designSystems";
import { googleFontsHref } from "@/lib/designSystems";

export default function DesignSystemsClient({ initialSystems }: { initialSystems: DesignSystem[] }) {
  const router = useRouter();
  const [systems, setSystems] = useState(initialSystems);
  const [selectedId, setSelectedId] = useState(initialSystems[0]?.id ?? "");
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const fontHrefs = useMemo(
    () => [...new Set(systems.map((s) => googleFontsHref(s)).filter((h): h is string => !!h))],
    [systems]
  );
  const det = systems.find((s) => s.id === selectedId);

  async function createDs() {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/design-systems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() || "Untitled system" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed to create design system");
      setSystems((s) => [...s, data.system]);
      setSelectedId(data.system.id);
      setNewOpen(false);
      setNewName("");
    } catch {
      // the form stays open so the name isn't lost; a retry is the recovery path here
    } finally {
      setCreating(false);
    }
  }

  function useInNewProject() {
    if (!det) return;
    router.push(det.id === "default" ? "/" : `/?ds=${det.id}`);
  }

  return (
    <>
      {fontHrefs.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}

      <div className="ds-header">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1>Design systems</h1>
          <span style={{ fontSize: 14, color: "var(--muted)" }}>
            The Writer applies the selected system&rsquo;s colors and type to every artifact.
          </span>
        </div>
        <button className="btn-primary" onClick={() => setNewOpen((v) => !v)}>
          New system
        </button>
      </div>

      {newOpen && (
        <div className="ds-new-form">
          <div className="ds-new-fields">
            <input
              className="text-input"
              placeholder="Name, e.g. Acme Brand"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <div className="form-actions">
              <button className="btn-secondary" onClick={createDs} disabled={creating}>
                {creating ? "Creating…" : "Create"}
              </button>
              <button className="btn-ghost" onClick={() => setNewOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
          <div className="drop-zone">
            <span className="t1">Drop brand files</span>
            <span className="t2">PDF, PPTX, images or fonts. Colors and type are extracted into tokens.</span>
          </div>
        </div>
      )}

      <div className="ds-grid">
        {systems.map((s) => (
          <button key={s.id} className={`ds-card${selectedId === s.id ? " selected" : ""}`} onClick={() => setSelectedId(s.id)}>
            <div className="ds-card-colors">
              {s.colors.map((c, i) => (
                <span key={i} style={{ background: c.hex }} />
              ))}
            </div>
            <div className="ds-card-body">
              <div className="ds-card-title-row">
                <span className="name">{s.name}</span>
                {s.id === "default" && <span className="ds-badge">Default</span>}
              </div>
              <span className="ds-card-meta">
                {s.colors.length} colors · {s.fonts.length} typefaces
                {s.updated_at ? ` · updated ${new Date(s.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}
              </span>
            </div>
          </button>
        ))}
      </div>

      {det && (
        <div className="ds-detail">
          <div className="ds-detail-head">
            <h2>{det.name}</h2>
            <button className="btn-ghost outline-text" onClick={useInNewProject}>
              Use in a new project →
            </button>
          </div>
          <div className="ds-tokens-grid">
            {det.colors.map((c, i) => (
              <div key={i} className="ds-token">
                <span className="ds-token-swatch" style={{ background: c.hex }} />
                <span className="ds-token-name">
                  <span>{c.name}</span>
                  <span className="hex">{c.hex}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="ds-fonts-grid">
            {det.fonts.map((f, i) => (
              <div key={i} className="ds-font-card">
                <span className="ds-font-role">{f.role}</span>
                <span className="ds-font-sample" style={{ fontFamily: f.stack }}>
                  The quick brown fox
                </span>
                <span className="ds-font-stack">{f.stack}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
