"use client";

import { useEffect, useRef, useState } from "react";

type FileEntry = { path: string; version: number; url: string };
type Line = { id: number; role: string; kind: "status" | "typing" | "tool" | "error"; text: string };

const ROLE_LABEL: Record<string, string> = {
  planner: "Planner",
  researcher: "Researcher",
  critic: "Critic",
  writer: "Writer",
  verifier: "Verifier",
  orchestrator: "Orchestrator",
};

let nextId = 1;

export default function Workspace({
  projectId,
  goal,
  status,
  initialFiles,
}: {
  projectId: string;
  goal: string;
  status: string;
  initialFiles: FileEntry[];
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const [files, setFiles] = useState<FileEntry[]>(initialFiles);
  const [running, setRunning] = useState(false);
  const started = useRef(false);
  // Tracks the in-progress "typing" line per (role, callIndex) so streamed
  // tokens append to the same line instead of spamming one line per token.
  const typingLineId = useRef<Map<string, number>>(new Map());
  const callCounter = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (status === "idle") run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pushLine(role: string, kind: Line["kind"], text: string) {
    const id = nextId++;
    setLines((l) => [...l, { id, role, kind, text }]);
    return id;
  }

  function appendToken(key: string, role: string, text: string) {
    const id = typingLineId.current.get(key);
    if (id == null) {
      const newId = pushLine(role, "typing", text);
      typingLineId.current.set(key, newId);
      return;
    }
    setLines((l) => l.map((ln) => (ln.id === id ? { ...ln, text: (ln.text + text).slice(-600) } : ln)));
  }

  function endTyping(key: string) {
    typingLineId.current.delete(key);
  }

  async function run() {
    setRunning(true);
    pushLine("orchestrator", "status", `starting run for: ${goal}`);
    const res = await fetch(`/api/projects/${projectId}/run`, { method: "POST" });
    if (!res.body) {
      setRunning(false);
      return;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, i).trim();
        buf = buf.slice(i + 2);
        if (!chunk.startsWith("data:")) continue;
        try {
          const e = JSON.parse(chunk.slice(5).trim());
          handleEvent(e);
        } catch {
          /* ignore malformed chunk */
        }
      }
    }
    setRunning(false);
    refreshFiles();
  }

  function handleEvent(e: any) {
    const role = e.role ?? "orchestrator";
    const label = ROLE_LABEL[role] ?? role;
    const key = e.callId ?? role;

    if (e.type === "token") {
      appendToken(key, role, e.payload.t ?? "");
      return;
    }

    // A non-token event closes out any in-progress "typing" line for that call.
    endTyping(key);

    if (e.type === "phase") {
      if (e.payload.status === "start") {
        const n = (callCounter.current.get(role) ?? 0) + 1;
        callCounter.current.set(role, n);
        const suffix = role === "researcher" ? ` #${n}` : "";
        pushLine(role, "status", `${label}${suffix} — thinking…`);
      } else if (e.payload.status === "fallback") {
        pushLine(role, "error", `${label} hit its step limit and fell back to a default result`);
      } else if (e.payload.status === "done") {
        pushLine(role, "status", `${label} finished`);
      }
    } else if (e.type === "tool-call") {
      const args = e.payload.args ?? {};
      let detail = "";
      if (e.payload.name === "web_search") detail = `searching: "${args.query}"`;
      else if (e.payload.name === "web_fetch") detail = `reading source ${args.source_id}`;
      else if (e.payload.name === "write_file") detail = `writing ${args.path} (${(args.content ?? "").length} chars)`;
      else if (e.payload.name === "str_replace") detail = `editing ${args.path}`;
      else if (e.payload.name === "read_file") detail = `reading ${args.path}`;
      else detail = `${e.payload.name}(${JSON.stringify(args).slice(0, 120)})`;
      pushLine(role, "tool", `${label}: ${detail}`);
    } else if (e.type === "tool-result") {
      // quiet by design — the tool-call line already describes the action
    } else if (e.type === "error") {
      pushLine(role, "error", `${label} error: ${e.payload.message}`);
    } else if (e.type === "done" || e.type === "stream-end") {
      pushLine("orchestrator", "status", "run complete");
      refreshFiles();
    }
  }

  async function refreshFiles() {
    const res = await fetch(`/api/projects/${projectId}`);
    const data = await res.json();
    setFiles(data.files ?? []);
  }

  const index = files.find((f) => f.path === "index.html");

  return (
    <div className="workspace">
      <div className="chat-panel">
        <div className="msg user">{goal}</div>
        <div className="chat-log">
          {lines.map((l) => (
            <div key={l.id} className={`event-line event-${l.kind}`}>
              {l.text}
            </div>
          ))}
          {running && <div className="event-line event-status">…</div>}
        </div>
        {!running && !index && (
          <button className="submit" style={{ width: "100%", borderRadius: 8 }} onClick={run}>
            Run
          </button>
        )}
      </div>
      <div className="canvas-area">
        {index ? (
          <div className="canvas-frame">
            <iframe src={index.url} sandbox="allow-scripts allow-popups allow-downloads" />
          </div>
        ) : (
          <p style={{ color: "var(--muted)" }}>{running ? "Generating…" : "No output yet."}</p>
        )}
        {index && (
          <div className="export-bar">
            <a href={`/api/projects/${projectId}/export?format=html&path=index.html`} target="_blank">
              HTML
            </a>
            <a href={`/api/projects/${projectId}/export?format=pdf&path=index.html`}>PDF</a>
          </div>
        )}
      </div>
    </div>
  );
}
