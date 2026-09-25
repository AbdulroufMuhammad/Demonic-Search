"use client";

import { useEffect, useRef } from "react";
import type { ThreadItem } from "@/lib/workspaceTypes";

export default function ChatPanel({
  title,
  statusLabel,
  statusColor,
  statusDot,
  running,
  phaseNow,
  runPct,
  runTime,
  items,
  thinkingText,
  expanded,
  onToggle,
  finalChips,
  chat,
  onChat,
  onSend,
  sendDisabled,
  sendLabel,
  target,
  onClearTarget,
  hint,
  placeholder,
  onBrand,
}: {
  title: string;
  statusLabel: string;
  statusColor: string;
  statusDot: string;
  running: boolean;
  phaseNow?: string;
  runPct?: number;
  runTime?: string;
  items: ThreadItem[];
  thinkingText?: string;
  expanded: Record<string, boolean>;
  onToggle: (key: string) => void;
  finalChips?: { l: string; onClick: () => void }[];
  chat: string;
  onChat: (v: string) => void;
  onSend: () => void;
  sendDisabled: boolean;
  sendLabel: string;
  target: { id: string; tag: string } | null;
  onClearTarget: () => void;
  hint: string;
  placeholder: string;
  onBrand: () => void;
}) {
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length, running]);

  return (
    <section className="chat-col">
      <header className="chat-header">
        <button className="brand-mark" style={{ border: "none", cursor: "pointer" }} onClick={onBrand}>
          D
        </button>
        <div className="chat-header-text">
          <span className="chat-title">{title}</span>
          <span className="chat-status" style={{ color: statusColor }}>
            <span className="status-dot" style={{ background: statusDot }} />
            {statusLabel}
          </span>
        </div>
      </header>

      {running && (
        <div className="run-progress">
          <div className="run-progress-row">
            <span className="run-progress-phase">{phaseNow}</span>
            <span>{runTime}</span>
          </div>
          <div className="run-progress-bar">
            <div className="run-progress-fill" style={{ width: `${runPct ?? 0}%` }} />
          </div>
        </div>
      )}

      <div className="thread" ref={threadRef}>
        {items.map((it) => {
          if (it.type === "user") {
            return (
              <div key={it.key} className="msg-user">
                {it.tag && <span className="msg-user-tag">{it.tag}</span>}
                <div className="msg-user-bubble">{it.text}</div>
              </div>
            );
          }
          if (it.type === "text") {
            return (
              <div key={it.key} className="msg-text">
                {it.shown}
                {it.caret && <span className="caret" />}
              </div>
            );
          }
          if (it.type === "error") {
            return (
              <div key={it.key} className="error-banner">
                {it.text}
              </div>
            );
          }
          const open = expanded[it.key] ?? false;
          const showBody = open && it.rows.length > 0 && !it.active;
          const isThinking = it.verb === "Thinking" && it.active;
          return (
            <div key={it.key} className="tool-row">
              <button className="tool-row-head" onClick={() => onToggle(it.key)}>
                <span className={`tool-verb${it.active ? " active" : ""}`}>{it.verb}</span>
                <span className={`tool-detail${it.active ? " active" : ""}`}>
                  {isThinking && thinkingText ? thinkingText : it.detail}
                </span>
                <span className="tool-meta">{it.meta}</span>
                {!!it.rows.length && !it.active && <span className="tool-chev">{open ? "▾" : "▸"}</span>}
              </button>
              {showBody && (
                <div className="tool-body">
                  {it.rows.map((r, i) => (
                    <div key={i} className="tool-body-row">
                      <span className="tool-body-k">{r.k}</span>
                      <span className="tool-body-t">{r.t}</span>
                      <span className="tool-body-d">{r.d}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {!running && !!finalChips?.length && (
          <div className="final-chips">
            {finalChips.map((c) => (
              <button key={c.l} className="final-chip" onClick={c.onClick}>
                {c.l}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="chat-composer">
        <div className="chat-composer-box">
          {target && (
            <div className="chat-target">
              <span className="chat-target-chip">
                {target.tag}
                <button onClick={onClearTarget}>×</button>
              </span>
            </div>
          )}
          <textarea
            className="chat-textarea"
            placeholder={placeholder}
            value={chat}
            onChange={(e) => onChat(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            rows={2}
          />
          <div className="chat-composer-row">
            <span className="chat-hint">{hint}</span>
            <button className="chat-send" onClick={onSend} disabled={sendDisabled}>
              {sendLabel}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
