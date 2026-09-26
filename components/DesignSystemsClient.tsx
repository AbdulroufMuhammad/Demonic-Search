"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DesignSystem, DSColor, DSFont } from "@/lib/designSystems";
import { CodebasePicker, DesignSystemCard, DesignSystemFonts } from "@/components/ui/Pickers";
import { IconArrowUp, IconClose, IconPlus } from "@/components/ui/Icons";

/** Hand the job to the design agent: it builds a spec page and saves the system to the picker. */
function GenerateWithAgent() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [codebase, setCodebase] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = !!prompt.trim() || !!codebase;
  async function go() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template: "designsystem",
          codebase,
          prompt: prompt.trim() || `Extract the design system from the ${codebase} codebase.`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't start");
      router.push(`/project/${data.project.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }
  return (
    <div className="ds-generate">
      <div className="ds-generate-head">
        <strong>Generate with the agent</strong>
        <span className="muted">Describe a brand, or connect a codebase to extract its real tokens. The result is saved here.</span>
      </div>
      <textarea
        rows={2}
        placeholder="e.g. A calm fintech brand: trustworthy, warm neutrals, one confident green"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            go();
          }
        }}
      />
      <div className="ds-generate-row">
        <CodebasePicker value={codebase} onChange={setCodebase} />
        <span className="grow" />
        <button type="button" className="btn-accent" onClick={go} disabled={!ready || busy}>
          {busy ? <span className="spinner" /> : <IconArrowUp size={14} />} Generate
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

const BLANK_COLORS: DSColor[] = [
  { name: "Background", hex: "#f7f5f0" },
  { name: "Surface", hex: "#ebe7de" },
  { name: "Text", hex: "#1f1d1a" },
  { name: "Accent", hex: "#d9774f" },
];
const BLANK_FONTS: DSFont[] = [
  { role: "Heading", stack: "'Fraunces', serif" },
  { role: "Body", stack: "'Inter', sans-serif" },
];

export default function DesignSystemsClient({ initialSystems, startNew }: { initialSystems: DesignSystem[]; startNew: boolean }) {
  const [systems, setSystems] = useState(initialSystems);
  const [selectedId, setSelectedId] = useState(initialSystems[0]?.id ?? "");
  const [editing, setEditing] = useState(startNew);
  const [name, setName] = useState("");
  const [colors, setColors] = useState<DSColor[]>(BLANK_COLORS);
  const [fonts, setFonts] = useState<DSFont[]>(BLANK_FONTS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const det = systems.find((s) => s.id === selectedId);
  const draft: DesignSystem = { id: "draft", name: name || "Untitled system", colors, fonts };

  async function create() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/design-systems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || "Untitled system", colors, fonts }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't save the design system");
      setSystems((s) => [...s, data.system]);
      setSelectedId(data.system.id);
      setEditing(false);
      setName("");
      setColors(BLANK_COLORS);
      setFonts(BLANK_FONTS);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DesignSystemFonts systems={[...systems, draft]} />
      <div className="ds-page-head">
        <div>
          <h1>Design systems</h1>
          <p className="muted">The agent designs with the selected system&rsquo;s palette and type.</p>
        </div>
        {!editing && (
          <button type="button" className="btn-accent" onClick={() => setEditing(true)}>
            <IconPlus size={14} /> Create manually
          </button>
        )}
      </div>

      <GenerateWithAgent />

      {editing && (
        <div className="ds-editor">
          <div className="ds-editor-form">
            <label className="field">
              <span>Name</span>
              <input className="text-input" placeholder="e.g. Acme Brand" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </label>
            <div className="field">
              <span>Colors</span>
              {colors.map((c, i) => (
                <div key={i} className="token-row">
                  <input type="color" value={c.hex} onChange={(e) => setColors((cs) => cs.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)))} />
                  <input className="text-input" value={c.name} onChange={(e) => setColors((cs) => cs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <span className="mono muted">{c.hex}</span>
                  <button type="button" className="icon-btn" onClick={() => setColors((cs) => cs.filter((_, j) => j !== i))} aria-label="Remove color">
                    <IconClose size={13} />
                  </button>
                </div>
              ))}
              {colors.length < 12 && (
                <button type="button" className="btn-ghost sm" onClick={() => setColors((cs) => [...cs, { name: `Color ${cs.length + 1}`, hex: "#888888" }])}>
                  <IconPlus size={13} /> Add color
                </button>
              )}
            </div>
            <div className="field">
              <span>Type (Google Fonts family, first is headings)</span>
              {fonts.map((f, i) => (
                <div key={i} className="token-row">
                  <input className="text-input narrow" value={f.role} onChange={(e) => setFonts((fs) => fs.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} />
                  <input
                    className="text-input"
                    value={f.stack.match(/'([^']+)'/)?.[1] ?? f.stack}
                    onChange={(e) => {
                      const fam = e.target.value.replace(/'/g, "");
                      const generic = /serif/i.test(f.stack) && !/sans/i.test(f.stack) ? "serif" : "sans-serif";
                      setFonts((fs) => fs.map((x, j) => (j === i ? { ...x, stack: `'${fam}', ${generic}` } : x)));
                    }}
                  />
                </div>
              ))}
            </div>
            {error && <p className="form-error">{error}</p>}
            <div className="form-actions">
              <button type="button" className="btn-accent" onClick={create} disabled={saving}>
                {saving ? "Saving…" : "Save design system"}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </div>
          <div className="ds-editor-preview">
            <DesignSystemCard ds={draft} />
          </div>
        </div>
      )}

      <div className="systems-grid">
        {systems.map((s) => (
          <DesignSystemCard key={s.id} ds={s} selected={s.id === selectedId} onClick={() => setSelectedId(s.id)} />
        ))}
      </div>

      {det && (
        <div className="ds-detail">
          <div className="ds-detail-head">
            <h2>{det.name}</h2>
            <Link href={`/?ds=${det.id}`} className="btn-secondary">
              Use in a new project →
            </Link>
          </div>
          <div className="ds-swatches">
            {det.colors.map((c, i) => (
              <div key={i} className="ds-swatch">
                <span style={{ background: c.hex }} />
                <strong>{c.name}</strong>
                <span className="mono muted">{c.hex}</span>
              </div>
            ))}
          </div>
          <div className="ds-fonts">
            {det.fonts.map((f, i) => (
              <div key={i} className="ds-font">
                <span className="muted">{f.role}</span>
                <span className="ds-font-sample" style={{ fontFamily: f.stack }}>
                  The quick brown fox jumps over the lazy dog
                </span>
                <span className="mono muted">{f.stack}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
