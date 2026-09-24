"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TEMPLATES } from "@/lib/templates";

export default function Composer() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [template, setTemplate] = useState("research");
  const [modelProfile, setModelProfile] = useState("quality");
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
        body: JSON.stringify({ prompt, template, model_profile: modelProfile }),
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
    <div>
      <div className="composer">
        <textarea
          placeholder="Describe what you want to make…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
        />
        <div className="composer-row">
          <span className="chip">Design system: none</span>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <select className="chip" value={modelProfile} onChange={(e) => setModelProfile(e.target.value)}>
              <option value="quality">Model · Quality</option>
              <option value="fast">Model · Fast</option>
            </select>
            <button className="submit" onClick={submit} disabled={submitting || !prompt.trim()}>
              {submitting ? "…" : "↑"}
            </button>
          </div>
        </div>
        <div className="templates">
          {TEMPLATES.map((t) => (
            <div
              key={t.id}
              className={`template-tile${template === t.id ? " selected" : ""}`}
              onClick={() => setTemplate(t.id)}
            >
              <span className="icon">{t.icon}</span>
              {t.label}
            </div>
          ))}
        </div>
      </div>
      {error && <p style={{ color: "#e05252", marginTop: 12 }}>{error}</p>}
    </div>
  );
}
