"use client";

import { useEffect, useRef, useState } from "react";
import type { TweakControl } from "@/lib/finalize";
import type { ElementStyle } from "@/lib/canvasBridge";
import { IconClose, IconComment, IconDownload, IconLink } from "@/components/ui/Icons";

const optValue = (o: string | { label: string; value: string }) => (typeof o === "string" ? o : o.value);
const optLabel = (o: string | { label: string; value: string }) => (typeof o === "string" ? o : o.label);

/** The design's own live controls, declared by the agent in <script id="tweaks">. */
export function TweaksBar({ controls, values, onChange }: { controls: TweakControl[]; values: Record<string, any>; onChange: (name: string, v: any) => void }) {
  return (
    <div className="tweaks-bar">
      {controls.map((c) => {
        const v = values[c.name] ?? c.value;
        const label = c.label ?? c.name;
        return (
          <label key={c.name} className="tweak">
            <span className="tweak-label">{label}</span>
            {c.type === "select" ? (
              <select value={String(v)} onChange={(e) => onChange(c.name, e.target.value)}>
                {(c.options ?? []).map((o) => (
                  <option key={optValue(o)} value={optValue(o)}>
                    {optLabel(o)}
                  </option>
                ))}
              </select>
            ) : c.type === "range" ? (
              <>
                <input
                  type="range"
                  min={c.min ?? 0}
                  max={c.max ?? 100}
                  step={c.step ?? 1}
                  value={Number(v)}
                  onChange={(e) => onChange(c.name, Number(e.target.value))}
                />
                <span className="tweak-value">
                  {Number(v)}
                  {c.unit ?? ""}
                </span>
              </>
            ) : c.type === "color" ? (
              <input type="color" value={String(v)} onChange={(e) => onChange(c.name, e.target.value)} />
            ) : c.type === "toggle" ? (
              <button type="button" className={`switch${v ? " on" : ""}`} onClick={() => onChange(c.name, !v)} aria-pressed={!!v}>
                <span />
              </button>
            ) : (
              <input type="text" value={String(v)} onChange={(e) => onChange(c.name, e.target.value)} />
            )}
          </label>
        );
      })}
    </div>
  );
}

function Slider({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <label className="edit-field">
      <span className="edit-field-head">
        <span>{label}</span>
        <input type="number" value={value} step={step} onChange={(e) => onChange(Number(e.target.value))} />
        {unit && <span className="unit">{unit}</span>}
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

/** Direct typographic edits for the element selected in Edit mode. Text itself is edited in place on the canvas. */
export function EditPanel({
  tag,
  style,
  onStyle,
  onAsk,
  onClose,
}: {
  tag: string;
  style: ElementStyle;
  onStyle: (patch: Partial<ElementStyle>) => void;
  onAsk: () => void;
  onClose: () => void;
}) {
  return (
    <aside className="edit-panel">
      <div className="edit-panel-head">
        <span className="edit-tag">&lt;{tag}&gt;</span>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <IconClose size={14} />
        </button>
      </div>
      <p className="edit-hint">Type directly on the canvas to change the text.</p>
      <Slider label="Size" value={style.fontSize} min={8} max={160} step={1} unit="px" onChange={(v) => onStyle({ fontSize: v })} />
      <Slider label="Line height" value={style.lineHeight} min={0.8} max={2.6} step={0.05} onChange={(v) => onStyle({ lineHeight: v })} />
      <Slider label="Letter spacing" value={style.letterSpacing} min={-0.1} max={0.4} step={0.005} unit="em" onChange={(v) => onStyle({ letterSpacing: v })} />
      <Slider label="Space after" value={style.marginBottom} min={0} max={160} step={1} unit="px" onChange={(v) => onStyle({ marginBottom: v })} />
      <div className="edit-row">
        <label className="edit-field compact">
          <span>Weight</span>
          <select value={style.fontWeight} onChange={(e) => onStyle({ fontWeight: Number(e.target.value) })}>
            {[300, 400, 500, 600, 700, 800, 900].map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
        <label className="edit-field compact">
          <span>Color</span>
          <input type="color" value={style.color} onChange={(e) => onStyle({ color: e.target.value })} />
        </label>
      </div>
      <div className="seg full">
        {(["left", "center", "right"] as const).map((a) => (
          <button key={a} type="button" className={style.textAlign === a ? "on" : ""} onClick={() => onStyle({ textAlign: a })}>
            {a[0].toUpperCase() + a.slice(1)}
          </button>
        ))}
      </div>
      <button type="button" className="btn-secondary wide" onClick={onAsk}>
        <IconComment size={14} /> Ask the agent to change this
      </button>
    </aside>
  );
}

export function CommentPopover({
  x,
  y,
  label,
  onSubmit,
  onCancel,
}: {
  x: number;
  y: number;
  label: string;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ta.current?.focus(), []);
  const send = () => text.trim() && onSubmit(text.trim());
  return (
    <div className="comment-pop" style={{ left: x, top: y }}>
      <div className="comment-pop-target">{label}</div>
      <textarea
        ref={ta}
        rows={3}
        placeholder="What should change here?"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          } else if (e.key === "Escape") onCancel();
        }}
      />
      <div className="comment-pop-actions">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn-accent" onClick={send} disabled={!text.trim()}>
          Comment
        </button>
      </div>
    </div>
  );
}

export function ShareDialog({
  projectId,
  path,
  onPrint,
  onClose,
}: {
  projectId: string;
  path: string | null;
  onPrint: () => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const links = [
    { key: "edit", label: "Project link", hint: "Anyone with it can view, chat and edit", url: `${origin}/project/${projectId}` },
    { key: "view", label: "View-only link", hint: "Just the design, no chat or editing", url: `${origin}/p/${projectId}${path ? `?file=${encodeURIComponent(path)}` : ""}` },
  ];
  async function copy(key: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  }
  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label="Share">
        <div className="modal-head">
          <h2>Share</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <IconClose size={16} />
          </button>
        </div>
        <p className="modal-note">There are no accounts — anyone with a link below can open this project.</p>
        {links.map((l) => (
          <div key={l.key} className="share-link">
            <div>
              <div className="share-link-label">{l.label}</div>
              <div className="share-link-hint">{l.hint}</div>
            </div>
            <button type="button" className="btn-secondary" onClick={() => copy(l.key, l.url)}>
              <IconLink size={14} /> {copied === l.key ? "Copied" : "Copy link"}
            </button>
          </div>
        ))}
        <div className="modal-section">Export {path ? `“${path}”` : ""}</div>
        <div className="export-row">
          <button type="button" className="btn-secondary" disabled={!path} onClick={onPrint}>
            <IconDownload size={14} /> PDF
          </button>
          <a
            className={`btn-secondary${path ? "" : " disabled"}`}
            href={path ? `/api/projects/${projectId}/export?path=${encodeURIComponent(path)}` : undefined}
          >
            <IconDownload size={14} /> Standalone HTML
          </a>
        </div>
        <p className="modal-foot">PDF opens your browser&rsquo;s print dialog — choose “Save as PDF”.</p>
      </div>
    </div>
  );
}
