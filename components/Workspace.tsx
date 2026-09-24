"use client";

import { useEffect, useRef, useState } from "react";

type FileEntry = { path: string; version: number; url: string };
type Msg = { role: string; content: string };

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
  const [lines, setLines] = useState<string[]>([]);
  const [files, setFiles] = useState<FileEntry[]>(initialFiles);
  const [running, setRunning] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (status === "idle") run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run() {
    setRunning(true);
    setLines((l) => [...l, `> starting run for: ${goal}`]);
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
    if (e.type === "phase") {
      setLines((l) => [...l, `${e.role ?? "orchestrator"}: ${e.payload.status}`]);
    } else if (e.type === "tool-call") {
      setLines((l) => [...l, `${e.role}: → ${e.payload.name}(${JSON.stringify(e.payload.args).slice(0, 120)})`]);
    } else if (e.type === "error") {
      setLines((l) => [...l, `error: ${e.payload.message}`]);
    } else if (e.type === "done" || e.type === "stream-end") {
      setLines((l) => [...l, "run complete"]);
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
          {lines.map((l, i) => (
            <div key={i} className="event-line">{l}</div>
          ))}
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
