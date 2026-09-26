"use client";

import { useState } from "react";

export default function AccessForm({ next, configured }: { next: string; configured: boolean }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/access/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "That key didn't work.");
      window.location.assign(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <main className="access-page">
      <form className="access-card" onSubmit={submit}>
        <div className="brand">
          <span className="brand-name">Vellum</span>
        </div>
        <h1>Enter your access key</h1>
        <p className="muted">Vellum is private. Use the main key or a temporary key you were given.</p>
        {configured ? (
          <>
            <input
              className="access-input"
              type="password"
              autoComplete="current-password"
              autoFocus
              placeholder="vlm_…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              aria-label="Access key"
            />
            <button type="submit" className="btn-accent access-submit" disabled={!key.trim() || busy}>
              {busy ? <span className="spinner" /> : null} Continue
            </button>
          </>
        ) : (
          <p className="form-error">Access keys aren&apos;t set up yet: add MAIN_ACCESS_KEY to the deployment&apos;s environment variables.</p>
        )}
        {error && <p className="form-error">{error}</p>}
        <p className="access-foot muted">Opening a shared view-only link doesn&apos;t need a key.</p>
      </form>
    </main>
  );
}
