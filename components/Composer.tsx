"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TEMPLATES } from "@/lib/templates";
import type { DesignSystem } from "@/lib/designSystems";

const SUGGEST = [
  "Compare heat pump adoption across the EU",
  "State of open-weight coding models, with sources",
  "Brief on US grid interconnection queues",
];

export default function Composer({
  systems,
  initialDsId = "",
}: {
  systems: DesignSystem[];
  initialDsId?: string;
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [template, setTemplate] = useState("research");
  const [model, setModel] = useState<"quality" | "fast">("quality");
  const [dsId, setDsId] = useState(initialDsId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!prompt.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), template, model_profile: model, design_system_id: dsId || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed to create project");
      router.push(`/project/${data.project.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="composer-box">
        <textarea
          className="composer-textarea"
          placeholder="Describe the report, deck or diagram you need. Research mode searches the web and cites every claim."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={3}
        />
        <div className="pill-row">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`pill${template === t.id ? " selected" : ""}`}
              onClick={() => setTemplate(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="composer-controls">
          <div className="composer-controls-left">
            <select className="select-inline" value={dsId} onChange={(e) => setDsId(e.target.value)}>
              <option value="">No design system</option>
              {systems.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <div className="segmented">
              {(["quality", "fast"] as const).map((m) => (
                <button key={m} type="button" className={model === m ? "active" : ""} onClick={() => setModel(m)}>
                  {m === "quality" ? "Quality" : "Fast"}
                </button>
              ))}
            </div>
          </div>
          <button className="btn-primary" onClick={submit} disabled={submitting || !prompt.trim()}>
            {submitting ? "…" : "Start"}
            <span className="kbd">↵</span>
          </button>
        </div>
      </div>
      <div className="suggestions">
        {SUGGEST.map((s) => (
          <button key={s} type="button" className="suggestion-chip" onClick={() => setPrompt(s)}>
            {s}
          </button>
        ))}
      </div>
      {error && <p style={{ color: "var(--danger)", margin: 0, fontSize: 13 }}>{error}</p>}
    </>
  );
}
