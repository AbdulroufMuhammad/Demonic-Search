"use client";

import { useEffect, useRef, useState } from "react";
import type { Question, Row } from "@/lib/thread";
import Markdown from "@/components/ui/Markdown";
import { AttachmentChips } from "@/components/ui/Attachments";
import { IconBolt, IconSparkle, IconChevronDown, IconChevronRight, IconComment, IconExternal, IconFile, IconThumbDown, IconThumbUp } from "@/components/ui/Icons";

function UserMessage({ row }: { row: Extract<Row, { kind: "user" }> }) {
  const meta = row.meta ?? {};
  const anchor = `msg-${row.key.slice(1)}`;
  if (meta.answers) {
    return (
      <div className="msg-user brief" id={anchor}>
        {row.text.split("\n").map((line, i) => {
          const at = line.indexOf(": ");
          return at > 0 ? (
            <div key={i}>
              <strong>{line.slice(0, at)}:</strong> {line.slice(at + 2)}
            </div>
          ) : (
            <div key={i}>{line}</div>
          );
        })}
      </div>
    );
  }
  return (
    <div className="msg-user" id={anchor}>
      {meta.target && (
        <div className="msg-target">
          <IconComment size={12} /> {meta.resolved ? "Resolved · " : ""}On &lt;{meta.target.tag}&gt;
          {meta.target.text ? ` “${String(meta.target.text).slice(0, 60)}${String(meta.target.text).length > 60 ? "…" : ""}”` : ""}
        </div>
      )}
      <div className="msg-user-text">{row.text}</div>
      {meta.attachments?.length > 0 && <AttachmentChips items={meta.attachments} />}
    </div>
  );
}

function Activity({ row }: { row: Extract<Row, { kind: "activity" }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`activity${row.active ? " active" : ""}${open ? " open" : ""}`}>
      <button type="button" className="activity-head" onClick={() => setOpen((v) => !v)}>
        <IconBolt size={13} />
        <span className="activity-title">{row.title}</span>
        {row.tools.length > 0 && (open ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />)}
      </button>
      {open && row.tools.length > 0 && (
        <ul className="activity-tools">
          {row.tools.map((t) => (
            <li key={t.callId} className={t.error ? "err" : ""}>
              <span>{t.label}</span>
              {t.error && <span className="tool-err">{t.error}</span>}
              {t.image && (
                <a href={t.image} target="_blank" rel="noreferrer" className="check-shot">
                  <img src={t.image} alt="Screenshot of the design as rendered" loading="lazy" />
                </a>
              )}
              {t.findings && t.findings.length > 0 && (
                <ul className="findings">
                  {t.findings.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              )}
              {t.links?.slice(0, 6).map((l) =>
                l.url ? (
                  <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
                    {l.title}
                  </a>
                ) : null
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const secs = (ms: number) => (ms >= 1000 ? `${Math.round(ms / 1000)}s` : "a moment");

/** The model's reasoning for one step, collapsed to a "Thought for Ns" row that opens to the full text. */
function Thought({ text, ms }: { text: string; ms: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`activity thought${open ? " open" : ""}`}>
      <button type="button" className="activity-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <IconSparkle size={13} />
        <span className="activity-title">Thought for {secs(ms)}</span>
        {open ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
      </button>
      {open && <div className="thought-text">{text}</div>}
    </div>
  );
}

/** The live "Thinking" row: click it to watch the reasoning (or the reply) stream in. */
function LiveThinking({ reasoning, text, open, setOpen }: { reasoning: string; text: string; open: boolean; setOpen: (fn: (v: boolean) => boolean) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const body = reasoning || text;
  useEffect(() => {
    if (open && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [open, body]);
  return (
    <div className={`activity active thought${open ? " open" : ""}`}>
      <button type="button" className="activity-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <IconSparkle size={13} />
        <span className="activity-title">Thinking</span>
        {open ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
      </button>
      {open && (
        <div className="thought-text live" ref={box}>
          {body || <span className="muted">Waiting for the model… This model may not share its reasoning; its progress notes will appear here as it works.</span>}
        </div>
      )}
    </div>
  );
}

function QuestionsCard({ row, disabled, onAnswer }: { row: Extract<Row, { kind: "questions" }>; disabled: boolean; onAnswer: (text: string, answers: Record<string, string>) => void }) {
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const answerFor = (q: Question) => other[q.id]?.trim() || picked[q.id] || "";

  if (row.answered) {
    return (
      <div className="questions done">
        {row.intro && <p className="questions-intro">{row.intro}</p>}
        <ul>
          {row.questions.map((q) => (
            <li key={q.id}>{q.question}</li>
          ))}
        </ul>
      </div>
    );
  }
  function submit(skip = false) {
    const answers: Record<string, string> = {};
    for (const q of row.questions) answers[q.id] = skip ? "Your call" : answerFor(q) || "Your call";
    const text = row.questions.map((q) => `${q.id}: ${answers[q.id]}`).join("\n");
    onAnswer(text, answers);
  }
  return (
    <div className="questions">
      {row.intro && <p className="questions-intro">{row.intro}</p>}
      {row.questions.map((q) => (
        <div key={q.id} className="question">
          <div className="question-label">{q.question}</div>
          <div className="question-options">
            {q.options.map((o) => (
              <button
                key={o}
                type="button"
                className={`opt${picked[q.id] === o && !other[q.id]?.trim() ? " on" : ""}`}
                onClick={() => {
                  setPicked((p) => ({ ...p, [q.id]: p[q.id] === o ? "" : o }));
                  setOther((p) => ({ ...p, [q.id]: "" }));
                }}
              >
                {o}
              </button>
            ))}
          </div>
          <input className="question-other" placeholder="Or type your own…" value={other[q.id] ?? ""} onChange={(e) => setOther((p) => ({ ...p, [q.id]: e.target.value }))} />
        </div>
      ))}
      <div className="questions-actions">
        <button type="button" className="btn-ghost" disabled={disabled} onClick={() => submit(true)}>
          Skip, use your judgement
        </button>
        <button type="button" className="btn-accent" disabled={disabled} onClick={() => submit()}>
          Continue
        </button>
      </div>
    </div>
  );
}

function Reply({ row }: { row: Extract<Row, { kind: "reply" }> }) {
  const [vote, setVote] = useState<0 | 1 | -1>(0);
  const files = [row.created && `Created ${row.created} file${row.created > 1 ? "s" : ""}`, row.edited && `Edited ${row.edited} file${row.edited > 1 ? "s" : ""}`].filter(Boolean);
  return (
    <div className="msg-agent">
      <div className="prose">
        <Markdown text={row.text} />
      </div>
      <div className="msg-foot">
        <button type="button" className={`icon-btn xs${vote === 1 ? " on" : ""}`} onClick={() => setVote(vote === 1 ? 0 : 1)} aria-label="Good response">
          <IconThumbUp size={13} />
        </button>
        <button type="button" className={`icon-btn xs${vote === -1 ? " on" : ""}`} onClick={() => setVote(vote === -1 ? 0 : -1)} aria-label="Bad response">
          <IconThumbDown size={13} />
        </button>
        {files.length > 0 && <span>{files.join(" · ")}</span>}
      </div>
    </div>
  );
}

export default function Thread({
  rows,
  running,
  liveText,
  liveReasoning,
  activePath,
  onOpenFile,
  onAnswer,
}: {
  rows: Row[];
  running: boolean;
  liveText: string;
  liveReasoning: string;
  activePath: string | null;
  onOpenFile: (path: string) => void;
  onAnswer: (text: string, answers: Record<string, string>) => void;
}) {
  const last = rows[rows.length - 1];
  // Kept here so the row stays open across steps while the user is watching it.
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const showThinking = running && (!!liveReasoning || (!liveText && !(last?.kind === "activity" && last.active)));
  return (
    <div className="thread">
      {rows.map((row) => {
        switch (row.kind) {
          case "user":
            return <UserMessage key={row.key} row={row} />;
          case "thought":
            return <Thought key={row.key} text={row.text} ms={row.ms} />;
          case "activity":
            return <Activity key={row.key} row={row} />;
          case "file":
            return (
              <button key={row.key} type="button" className={`file-chip${row.path === activePath ? " current" : ""}`} onClick={() => onOpenFile(row.path)}>
                <IconFile size={14} />
                <span className="file-chip-name">{row.path}</span>
                <span className="file-chip-v">v{row.version}</span>
                <IconExternal size={13} />
              </button>
            );
          case "questions":
            return <QuestionsCard key={row.key} row={row} disabled={running} onAnswer={onAnswer} />;
          case "reply":
            return <Reply key={row.key} row={row} />;
          case "error":
            return (
              <div key={row.key} className="msg-error">
                {row.text}
              </div>
            );
        }
      })}
      {showThinking && <LiveThinking reasoning={liveReasoning} text={liveText} open={thinkingOpen} setOpen={setThinkingOpen} />}
      {running && liveText && (
        <div className="msg-agent live">
          <div className="prose">
            <Markdown text={liveText.length > 1200 ? "…" + liveText.slice(-1200) : liveText} />
          </div>
        </div>
      )}
    </div>
  );
}
