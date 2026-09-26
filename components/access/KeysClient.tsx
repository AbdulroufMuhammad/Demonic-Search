"use client";

import { useEffect, useState } from "react";

type KeyRow = { id: string; name: string; hint: string; expires_at: string; revoked_at: string | null; last_used_at: string | null; created_at: string };

const DURATIONS = [
  { label: "1 hour", hours: 1 },
  { label: "1 day", hours: 24 },
  { label: "7 days", hours: 24 * 7 },
  { label: "30 days", hours: 24 * 30 },
];

function when(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function status(k: KeyRow): { label: string; tone: "ok" | "off" } {
  if (k.revoked_at) return { label: "Revoked", tone: "off" };
  const left = new Date(k.expires_at).getTime() - Date.now();
  if (left <= 0) return { label: "Expired", tone: "off" };
  const h = left / 3_600_000;
  return { label: h < 1 ? `${Math.max(1, Math.round(h * 60))} min left` : h < 48 ? `${Math.round(h)} h left` : `${Math.round(h / 24)} days left`, tone: "ok" };
}

/** A datetime-local value for a moment, in the browser's time zone. */
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export default function KeysClient() {
  const [keys, setKeys] = useState<KeyRow[] | null>(null);
  const [name, setName] = useState("");
  const [choice, setChoice] = useState<string>("24");
  const [custom, setCustom] = useState(localInput(new Date(Date.now() + 3 * 86_400_000)));
  const [created, setCreated] = useState<{ key: string; name: string; expires: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/access/keys");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error ?? "Couldn't load keys.");
    setKeys(data.keys);
  }
  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setCopied(false);
    const body = choice === "custom" ? { name, expiresAt: new Date(custom).toISOString() } : { name, hours: Number(choice) };
    const res = await fetch("/api/access/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Couldn't create the key.");
    setCreated({ key: data.key, name: data.record.name, expires: data.record.expires_at });
    setName("");
    setKeys((k) => [data.record, ...(k ?? [])]);
  }

  async function revoke(k: KeyRow) {
    if (!confirm(`Revoke “${k.name}”? Anyone using it loses access within about 30 seconds.`)) return;
    const res = await fetch(`/api/access/keys/${k.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error ?? "Couldn't revoke the key.");
    if (data.record) setKeys((list) => (list ?? []).map((x) => (x.id === k.id ? data.record : x)));
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.key);
      setCopied(true);
    } catch {}
  }

  const active = (keys ?? []).filter((k) => status(k).tone === "ok");
  const past = (keys ?? []).filter((k) => status(k).tone === "off");

  return (
    <main className="keys-page">
      <h1>Access keys</h1>
      <p className="muted">
        You&apos;re signed in with the main key. Temporary keys give full use of Vellum until they expire or you revoke them; they can&apos;t manage keys. Shared view-only
        links never need a key.
      </p>

      <form className="keys-create" onSubmit={create}>
        <label>
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Amina, client review" maxLength={80} />
        </label>
        <label>
          <span>Expires in</span>
          <select value={choice} onChange={(e) => setChoice(e.target.value)}>
            {DURATIONS.map((d) => (
              <option key={d.hours} value={String(d.hours)}>
                {d.label}
              </option>
            ))}
            <option value="custom">Pick a date and time…</option>
          </select>
        </label>
        {choice === "custom" && (
          <label>
            <span>Expires at</span>
            <input type="datetime-local" value={custom} min={localInput(new Date(Date.now() + 5 * 60_000))} onChange={(e) => setCustom(e.target.value)} />
          </label>
        )}
        <button type="submit" className="btn-accent" disabled={busy}>
          {busy ? <span className="spinner" /> : null} Create key
        </button>
      </form>
      {error && <p className="form-error">{error}</p>}

      {created && (
        <div className="keys-new" role="status">
          <div>
            <strong>{created.name}</strong> · expires {when(created.expires)}
          </div>
          <code>{created.key}</code>
          <div className="keys-new-row">
            <button type="button" className="btn-secondary" onClick={copy}>
              {copied ? "Copied" : "Copy key"}
            </button>
            <span className="muted">Copy it now: it won&apos;t be shown again.</span>
          </div>
        </div>
      )}

      <h2>Active</h2>
      {keys == null ? (
        <p className="muted">Loading…</p>
      ) : active.length === 0 ? (
        <p className="muted">No active temporary keys.</p>
      ) : (
        <KeyTable rows={active} onRevoke={revoke} />
      )}
      {past.length > 0 && (
        <>
          <h2>Expired and revoked</h2>
          <KeyTable rows={past} />
        </>
      )}
    </main>
  );
}

function KeyTable({ rows, onRevoke }: { rows: KeyRow[]; onRevoke?: (k: KeyRow) => void }) {
  return (
    <div className="keys-table" role="table">
      <div className="keys-row head" role="row">
        <span>Name</span>
        <span>Key</span>
        <span>Expires</span>
        <span>Last used</span>
        <span>Status</span>
        <span />
      </div>
      {rows.map((k) => {
        const s = status(k);
        return (
          <div className="keys-row" role="row" key={k.id}>
            <span className="keys-name">{k.name}</span>
            <span className="mono muted">vlm_…{k.hint}</span>
            <span>{when(k.expires_at)}</span>
            <span className="muted">{when(k.last_used_at)}</span>
            <span className={`keys-status ${s.tone}`}>{s.label}</span>
            <span>
              {onRevoke && (
                <button type="button" className="btn-ghost danger-text" onClick={() => onRevoke(k)}>
                  Revoke
                </button>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
