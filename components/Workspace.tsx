"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ChatPanel from "@/components/workspace/ChatPanel";
import BoardView from "@/components/workspace/BoardView";
import ReportCanvas, { type ReportCanvasHandle } from "@/components/workspace/ReportCanvas";
import InspectorDrawer from "@/components/workspace/InspectorDrawer";
import SourceDrawer from "@/components/workspace/SourceDrawer";
import ShareDialog from "@/components/workspace/ShareDialog";
import { buildThread } from "@/lib/buildThread";
import { getTemplate } from "@/lib/templates";
import type { ProjectData, StoredEvent, StoredMessage } from "@/lib/projectData";
import type { SelInfo } from "@/lib/workspaceTypes";

let liveSeq = 0;
const liveEvent = (role: string | undefined, type: string, payload: any): StoredEvent => ({
  id: `live-${Date.now()}-${liveSeq++}`,
  role: role ?? null,
  type,
  payload,
  created_at: new Date().toISOString(),
});

async function streamSSE(url: string, body: unknown, onEvent: (e: any) => void) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) {
    onEvent({ type: "error", payload: { message: (await res.json().catch(() => ({}))).error ?? `request failed (${res.status})` } });
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
        onEvent(JSON.parse(chunk.slice(5).trim()));
      } catch {
        /* ignore malformed chunk */
      }
    }
  }
}

export default function Workspace({ initial, isOwner }: { initial: ProjectData; isOwner: boolean }) {
  const router = useRouter();
  const template = getTemplate(initial.project.template);

  const [project, setProject] = useState(initial.project);
  const [events, setEvents] = useState<StoredEvent[]>(initial.events);
  const [messages, setMessages] = useState<StoredMessage[]>(initial.messages);
  const [board, setBoard] = useState(initial.board);
  const [reportVersion, setReportVersion] = useState(initial.files.find((f) => f.path === "index.html")?.version ?? 0);
  const [reportHtml, setReportHtml] = useState<string | null>(null);

  const [running, setRunning] = useState(project.status === "running");
  const [phaseNow, setPhaseNow] = useState("Starting…");
  const [stageCount, setStageCount] = useState(0);
  const [budget, setBudget] = useState(initial.board.budget);
  const [runStart, setRunStart] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const [tab, setTab] = useState<"report" | "board">(template.research ? "board" : "report");
  const [inspect, setInspect] = useState(false);
  const [sel, setSel] = useState<SelInfo | null>(null);
  const [drawer, setDrawer] = useState<"inspect" | "source" | null>(null);
  const [selSourceId, setSelSourceId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [chat, setChat] = useState("");
  const [target, setTarget] = useState<{ id: string; tag: string } | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const canvasRef = useRef<ReportCanvasHandle>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const started = useRef(false);

  // ----- data refresh -----
  async function resync() {
    const res = await fetch(`/api/projects/${project.id}`);
    if (!res.ok) return;
    const data: ProjectData = await res.json();
    setProject(data.project);
    setEvents(data.events);
    setMessages(data.messages);
    setBoard(data.board);
    setReportVersion(data.files.find((f) => f.path === "index.html")?.version ?? 0);
  }

  async function fetchReport() {
    const res = await fetch(`/api/projects/${project.id}/file?path=index.html`);
    if (!res.ok) return;
    const data = await res.json();
    setReportHtml(data.content);
    setReportVersion(data.version);
  }

  async function refreshBoard() {
    const res = await fetch(`/api/projects/${project.id}/board`);
    if (res.ok) setBoard(await res.json());
  }

  useEffect(() => {
    if (project.status === "ready") fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll if we loaded mid-run (e.g. a page reload) instead of racing the /run endpoint again.
  useEffect(() => {
    if (project.status !== "running") return;
    setRunning(true);
    const iv = setInterval(async () => {
      const res = await fetch(`/api/projects/${project.id}`);
      if (!res.ok) return;
      const data: ProjectData = await res.json();
      if (data.project.status !== "running") {
        clearInterval(iv);
        setRunning(false);
        setProject(data.project);
        setEvents(data.events);
        setMessages(data.messages);
        setBoard(data.board);
        setReportVersion(data.files.find((f) => f.path === "index.html")?.version ?? 0);
        if (data.project.status === "ready") fetchReport();
      }
    }, 3000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => setElapsed(Math.round((Date.now() - (runStart ?? Date.now())) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [running, runStart]);

  function onLiveEvent(e: any) {
    if (e.type === "stream-end") {
      setRunning(false);
      resync().then(() => {
        if (tabRef.current === "report" || template.research === false) fetchReport();
      });
      return;
    }
    setEvents((ev) => [...ev, liveEvent(e.role, e.type, e.payload)]);
    if (e.type === "phase") {
      setStageCount((n) => n + 1);
      if (e.payload?.status) setPhaseNow(String(e.payload.status));
    } else if (e.type === "step") {
      setStageCount((n) => n + 1);
    } else if (e.type === "tool-result" && typeof e.payload?.searchesLeft === "number") {
      setBudget({ searchesLeft: e.payload.searchesLeft, tokensLeft: e.payload.tokensLeft ?? 0 });
    }
    if (e.type === "step" && (e.payload?.kind === "check" || e.payload?.kind === "plan")) refreshBoard();
  }
  const tabRef = useRef(tab);
  tabRef.current = tab;

  async function startRun(message?: string) {
    if (running) return;
    setRunning(true);
    setRunStart(Date.now());
    setElapsed(0);
    setStageCount(0);
    setPhaseNow("Starting…");
    setTab(template.research ? "board" : "report");
    setInspect(false);
    setDrawer(null);
    setSel(null);
    setChat("");
    setProject((p) => ({ ...p, status: "running" }));
    if (message) setMessages((m) => [...m, { id: "opt-" + Date.now(), role: "user", content: message, created_at: new Date().toISOString() }]);
    await streamSSE(`/api/projects/${project.id}/run`, { message }, onLiveEvent);
  }

  async function chatEdit(message: string, tgt: { id: string; tag: string } | null) {
    if (running) return;
    setRunning(true);
    setChat("");
    setTarget(null);
    const content = tgt ? `[${tgt.tag}] ${message}` : message;
    setMessages((m) => [...m, { id: "opt-" + Date.now(), role: "user", content, created_at: new Date().toISOString() }]);
    await streamSSE(`/api/projects/${project.id}/chat`, { message, target: tgt }, onLiveEvent);
  }

  async function queueMessage(content: string) {
    setChat("");
    setMessages((m) => [...m, { id: "opt-" + Date.now(), role: "user", content, created_at: new Date().toISOString() }]);
    await fetch(`/api/projects/${project.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  }

  function sendChat() {
    const t = chat.trim();
    if (project.status === "idle") {
      startRun(t || undefined);
      return;
    }
    if (!t) return;
    if (running) {
      queueMessage(t);
      return;
    }
    chatEdit(t, target);
  }

  // ----- inspector edit persistence -----
  function scheduleSave(next: SelInfo) {
    setSel(next);
    canvasRef.current?.pushStyle(next.id, { fontSize: next.fs, lineHeight: next.lh, marginBottom: next.mb });
    if (!next.locked) canvasRef.current?.pushText(next.id, next.text);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persistEdit(next), 600);
  }

  async function persistEdit(next: SelInfo) {
    const edit: any = { id: next.id, style: { fontSize: next.fs, lineHeight: next.lh, marginBottom: next.mb } };
    if (!next.locked) edit.text = next.text;
    const res = await fetch(`/api/projects/${project.id}/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ edits: [edit] }),
    });
    if (res.ok) fetchReport();
  }

  // ----- derived -----
  const items = useMemo(() => buildThread(events, messages), [events, messages]);
  const citeOrder = useMemo(() => {
    const map = new Map<string, number>();
    if (typeof window === "undefined" || !reportHtml) return map;
    const doc = new DOMParser().parseFromString(reportHtml, "text/html");
    doc.querySelectorAll(".r-sources li[data-src]").forEach((el, i) => map.set(el.getAttribute("data-src")!, i + 1));
    return map;
  }, [reportHtml]);
  const citeNumber = (id: string) => citeOrder.get(id) ?? board.sources.findIndex((s) => s.id === id) + 1;

  const statusMeta =
    project.status === "running"
      ? { label: "Researching", color: "var(--accent)", dot: "var(--accent)" }
      : project.status === "ready"
        ? { label: "Ready", color: "var(--text)", dot: "var(--accent)" }
        : project.status === "error"
          ? { label: "Error", color: "var(--danger)", dot: "var(--danger)" }
          : { label: "Not started", color: "var(--muted)", dot: "var(--muted)" };

  const openGap = board.gaps.find((g) => !g.resolved);
  const finalChips =
    project.status === "ready"
      ? [
          ...(template.research ? [{ l: "Open the board", onClick: () => setTab("board") }] : []),
          ...(openGap
            ? [{ l: `Research: ${openGap.question}`, onClick: () => chatEdit(`Run another research round on: ${openGap.question}`, null) }]
            : []),
        ]
      : undefined;

  function selectElement(next: SelInfo) {
    setSel(next);
    setDrawer("inspect");
    setSelSourceId(null);
  }
  function openSource(src: string) {
    setSelSourceId(src);
    setDrawer("source");
  }
  function closeDrawer() {
    setDrawer(null);
    setSel(null);
    setSelSourceId(null);
  }
  function toggleInspect() {
    if (project.status !== "ready") return;
    setInspect((v) => {
      if (v) closeDrawer();
      return !v;
    });
  }

  return (
    <div className="workspace-shell">
      <ChatPanel
        title={project.title}
        statusLabel={statusMeta.label}
        statusColor={statusMeta.color}
        statusDot={statusMeta.dot}
        running={running}
        phaseNow={phaseNow}
        runPct={Math.min(95, stageCount * 10) || (project.status === "ready" ? 100 : 0)}
        runTime={`${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`}
        searchesLeft={budget?.searchesLeft ?? 40}
        items={items}
        expanded={expanded}
        onToggle={(key) => setExpanded((e) => ({ ...e, [key]: !e[key] }))}
        finalChips={finalChips}
        chat={chat}
        onChat={setChat}
        onSend={sendChat}
        sendDisabled={project.status === "idle" ? false : running || !chat.trim()}
        sendLabel={project.status === "idle" ? "Start ↑" : "↑"}
        target={target}
        onClearTarget={() => setTarget(null)}
        hint={
          project.status === "idle"
            ? "Send starts the research run"
            : running
              ? "Messages queue for the Writer"
              : target
                ? "Commenting on an element"
                : "↵ to send"
        }
        placeholder={
          target
            ? "Describe the change to this element…"
            : project.status === "ready"
              ? "Ask for changes, or select an element with Inspect"
              : "Wait for the run, or add instructions…"
        }
        onBrand={() => router.push("/")}
      />
      <section className="canvas-col">
        <div className="canvas-toolbar">
          <div className="canvas-toolbar-left">
            {template.research && (
              <div className="tab-group">
                <button className={`tab-btn${tab === "report" ? " active" : ""}`} onClick={() => setTab("report")}>
                  Report
                </button>
                <button className={`tab-btn${tab === "board" ? " active" : ""}`} onClick={() => setTab("board")}>
                  Board
                </button>
              </div>
            )}
            <span className="file-label">{project.status === "ready" ? `index.html · v${reportVersion}` : "index.html · writing"}</span>
          </div>
          <div className="canvas-toolbar-right">
            <button className={`btn-inspect${inspect ? " active" : ""}`} onClick={toggleInspect} disabled={project.status !== "ready"}>
              {inspect ? "Inspecting" : "Inspect"}
            </button>
            <button className="btn-share" onClick={() => setShareOpen(true)}>
              Share
            </button>
          </div>
        </div>

        <div className="canvas-body">
          {tab === "board" && <BoardView board={board} />}
          {tab === "report" && project.status !== "ready" && (
            <div className="writing-placeholder">
              <div>
                <div className="writing-skeleton">
                  <span className="l1" />
                  <span className="l2" />
                  <span className="l3" />
                </div>
                <p className="writing-caption">The Writer starts once research is verified.</p>
              </div>
            </div>
          )}
          {tab === "report" && project.status === "ready" && reportHtml && (
            <div className="report-frame-wrap">
              <ReportCanvas ref={canvasRef} html={reportHtml} inspect={inspect} selectedId={sel?.id ?? null} onCite={openSource} onSelect={selectElement} />
            </div>
          )}

          {drawer === "inspect" && sel && (
            <InspectorDrawer
              sel={sel}
              onText={(text) => scheduleSave({ ...sel, text })}
              onFontSize={(fs) => scheduleSave({ ...sel, fs })}
              onLineHeight={(lh) => scheduleSave({ ...sel, lh })}
              onMarginBottom={(mb) => scheduleSave({ ...sel, mb })}
              onAsk={() => setTarget({ id: sel.id, tag: sel.tag })}
              onClose={closeDrawer}
            />
          )}
          {drawer === "source" && selSourceId && <SourceDrawer sourceId={selSourceId} board={board} citeNumber={citeNumber} onClose={closeDrawer} />}
        </div>
      </section>

      {shareOpen && (
        <ShareDialog
          projectId={project.id}
          title={project.title}
          access={project.share_access}
          isOwner={isOwner}
          onAccessChange={async (access) => {
            setProject((p) => ({ ...p, share_access: access }));
            await fetch(`/api/projects/${project.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ share_access: access }),
            });
          }}
          onClose={() => setShareOpen(false)}
          onExport={(format) => window.open(`/api/projects/${project.id}/export?format=${format}&path=index.html`, "_blank")}
        />
      )}
    </div>
  );
}
