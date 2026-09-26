"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectData, StoredEvent, StoredMessage, FileEntry } from "@/lib/projectData";
import type { DesignSystem } from "@/lib/designSystems";
import type { ModelKey } from "@/lib/gateway";
import type { TweakControl } from "@/lib/finalize";
import type { BridgeOut, CanvasMode, ElementStyle, Rect } from "@/lib/canvasBridge";
import { buildThread } from "@/lib/thread";
import { printHtml } from "@/lib/print";
import { relativeTime } from "@/lib/relativeTime";
import Canvas, { type CanvasHandle } from "@/components/project/Canvas";
import Thread from "@/components/project/Thread";
import { CommentPopover, EditPanel, ShareDialog, TweaksBar } from "@/components/project/Overlays";
import Popover, { MenuItem } from "@/components/ui/Popover";
import { DesignSystemPicker, ModelPicker, type ModelOption } from "@/components/ui/Pickers";
import { AttachButton, AttachmentChips, type Attachment } from "@/components/ui/Attachments";
import {
  IconArrowUp,
  IconChevronDown,
  IconComment,
  IconDownload,
  IconExpand,
  IconExternal,
  IconHistory,
  IconHome,
  IconPencil,
  IconPointer,
  IconRefresh,
  IconShare,
  IconSidebar,
  IconSliders,
  IconStop,
} from "@/components/ui/Icons";

type Pick = { id: string | null; tag: string; text: string; html: string; rect: Rect };
type Selection = { id: string; tag: string; style: ElementStyle };

const ZOOMS = [50, 75, 100, 125, 150];
const MAX_CONTINUATIONS = 6;
let tempId = 0;

async function readSSE(res: Response, onEvent: (e: any) => void) {
  const reader = res.body!.getReader();
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
      } catch {}
    }
  }
}

export default function ProjectView({ initial, systems, models }: { initial: ProjectData; systems: DesignSystem[]; models: ModelOption[] }) {
  const router = useRouter();
  const [project, setProject] = useState(initial.project);
  const [files, setFiles] = useState<FileEntry[]>(initial.files);
  const [messages, setMessages] = useState<StoredMessage[]>(initial.messages);
  const [events, setEvents] = useState<StoredEvent[]>(initial.events);
  const [running, setRunning] = useState(initial.project.status === "running");
  const [liveText, setLiveText] = useState("");
  const [liveReasoning, setLiveReasoning] = useState("");
  const [dsList, setDsList] = useState(systems);

  const [activePath, setActivePath] = useState<string | null>(initial.files[0]?.path ?? null);
  const [viewVersion, setViewVersion] = useState<number | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [docKey, setDocKey] = useState("init");
  const [draft, setDraft] = useState<{ path: string; html: string } | null>(null);

  const [mode, setMode] = useState<CanvasMode>("view");
  const [zoom, setZoom] = useState(100);
  const [pages, setPages] = useState(0);
  const [tweaks, setTweaks] = useState<TweakControl[]>([]);
  const [tweakValues, setTweakValues] = useState<Record<string, any>>({});
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [pick, setPick] = useState<Pick | null>(null);
  const [sel, setSel] = useState<Selection | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);

  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const canvas = useRef<CanvasHandle>(null);
  const stage = useRef<HTMLDivElement>(null);
  const threadEnd = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const draftBuf = useRef<{ path: string; html: string } | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout>>();
  const willContinue = useRef(false);
  const continuations = useRef(0);
  const activePathRef = useRef(activePath);
  activePathRef.current = activePath;
  const editQueue = useRef<Map<string, { id: string; html?: string; style?: Record<string, any> }>>(new Map());
  const editTimer = useRef<ReturnType<typeof setTimeout>>();
  const tweakTimer = useRef<ReturnType<typeof setTimeout>>();

  const activeFile = files.find((f) => f.path === activePath) ?? null;
  const rows = useMemo(() => buildThread(messages, events, running), [messages, events, running]);

  // ---------- data ----------
  const loadFile = useCallback(
    async (path: string, version?: number | null) => {
      const res = await fetch(`/api/projects/${project.id}/file?path=${encodeURIComponent(path)}${version ? `&version=${version}` : ""}`);
      if (!res.ok) return;
      const data = await res.json();
      if (path !== activePathRef.current) return;
      setHtml(data.content);
      setDocKey(`${path}@${data.version}@${Date.now()}`);
    },
    [project.id]
  );

  const refreshProject = useCallback(async () => {
    const res = await fetch(`/api/projects/${project.id}`);
    if (!res.ok) return null;
    const data: ProjectData = await res.json();
    setProject(data.project);
    setFiles(data.files);
    setMessages(data.messages);
    setEvents(data.events);
    return data;
  }, [project.id]);

  useEffect(() => {
    if (activePath) loadFile(activePath, viewVersion);
    else setHtml(null);
    setPages(0);
    setTweaks([]);
    setTweakValues({});
    setPick(null);
    setSel(null);
  }, [activePath, viewVersion, loadFile]);

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ block: "end" });
  }, [rows.length, liveText, running]);

  // ---------- turns ----------
  const handleEvent = useCallback(
    (e: any) => {
      const p = e.payload ?? {};
      switch (e.type) {
        case "token":
          setLiveText((t) => t + String(p.t ?? ""));
          return;
        case "reasoning":
          setLiveReasoning((t) => t + String(p.t ?? ""));
          return;
        case "draft": {
          const cur = draftBuf.current;
          const html = (p.reset || !cur || cur.path !== p.path ? "" : cur.html) + String(p.append ?? "");
          draftBuf.current = { path: p.path, html };
          if (p.reset) {
            setActivePath(p.path);
            setViewVersion(null);
            setMode("view");
          }
          if (!draftTimer.current) {
            draftTimer.current = setTimeout(() => {
              draftTimer.current = undefined;
              if (draftBuf.current) setDraft({ ...draftBuf.current });
            }, 200);
          }
          return;
        }
        case "message": {
          const m: StoredMessage = p.message;
          setMessages((ms) => {
            const i = p.replaces ? ms.findIndex((x) => x.id === p.replaces) : -1;
            if (i >= 0) return ms.map((x, j) => (j === i ? m : x));
            return ms.some((x) => x.id === m.id) ? ms : [...ms, m];
          });
          if (m.role === "assistant") setLiveText("");
          return;
        }
        case "continue":
          willContinue.current = true;
          return;
        case "done":
          return;
        case "stream-end":
          return;
      }
      const ev: StoredEvent = { id: e.id ?? `live-${tempId++}`, type: e.type, payload: p, created_at: e.created_at ?? new Date().toISOString() };
      setEvents((es) => [...es, ev]);
      if (e.type === "thought") setLiveReasoning("");
      if (e.type === "note") setLiveText("");
      if (e.type === "tool-call") setLiveText("");
      if (e.type === "tool-result" && p.name === "save_design_system" && p.system) {
        setDsList((list) => [...list.filter((d) => d.id !== p.system.id), p.system]);
        setProject((pr) => ({ ...pr, design_system_id: p.system.id }));
      }
      if (e.type === "tool-result" && (p.name === "write_file" || p.name === "str_replace") && !p.error && p.path) {
        draftBuf.current = null;
        clearTimeout(draftTimer.current);
        draftTimer.current = undefined;
        setDraft(null);
        setFiles((fs) => {
          const now = new Date().toISOString();
          const existing = fs.find((f) => f.path === p.path);
          const entry: FileEntry = existing
            ? { ...existing, version: p.version, updated_at: now, versions: [{ version: p.version, created_at: now }, ...existing.versions] }
            : { path: p.path, version: p.version, url: "", updated_at: now, versions: [{ version: p.version, created_at: now }] };
          return [entry, ...fs.filter((f) => f.path !== p.path)];
        });
        setViewVersion(null);
        if (activePathRef.current === p.path || !activePathRef.current) {
          activePathRef.current = p.path;
          setActivePath(p.path);
          loadFile(p.path);
        } else {
          setActivePath(p.path);
        }
      }
    },
    [loadFile]
  );

  const runTurn = useCallback(
    async (body: Record<string, unknown>) => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setRunning(true);
      setLiveText("");
      setLiveReasoning("");
      willContinue.current = false;
      try {
        const res = await fetch(`/api/projects/${project.id}/turn`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, activeFile: activePathRef.current }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const err = await res.json().catch(() => ({}));
          handleEvent({ type: "error", payload: { message: err.error ?? `Request failed (${res.status})` } });
        } else {
          await readSSE(res, handleEvent);
        }
      } catch (e) {
        if (!ctrl.signal.aborted) handleEvent({ type: "error", payload: { message: "Lost the connection to the agent." } });
      }
      if (willContinue.current && !ctrl.signal.aborted && continuations.current < MAX_CONTINUATIONS) {
        continuations.current += 1;
        return runTurn({ resume: true });
      }
      abortRef.current = null;
      draftBuf.current = null;
      setDraft(null);
      setLiveText("");
      setLiveReasoning("");
      setRunning(false);
      const data = await refreshProject();
      const path = activePathRef.current ?? data?.files[0]?.path ?? null;
      if (path) {
        if (path !== activePathRef.current) setActivePath(path);
        else loadFile(path);
      }
    },
    [project.id, handleEvent, refreshProject, loadFile]
  );

  function send(text: string, extra: Record<string, unknown> = {}) {
    if (running || (!text.trim() && !attachments.length)) return;
    const clientId = `local-${tempId++}`;
    const meta: any = { ...(extra.meta as object) };
    if (attachments.length) meta.attachments = attachments;
    setMessages((ms) => [...ms, { id: clientId, role: "user", content: text.trim(), meta, created_at: new Date().toISOString() }]);
    setInput("");
    setAttachments([]);
    continuations.current = 0;
    runTurn({ message: text.trim(), clientId, attachments: attachments.length ? attachments : undefined, ...(extra.body as object) });
  }

  function stop() {
    abortRef.current?.abort();
  }

  // A brand-new project (created on Home) starts working right away.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const hasReply = initial.messages.some((m) => m.role === "assistant") || initial.events.length > 0;
    if (initial.project.status === "idle" && !hasReply && initial.messages.some((m) => m.role === "user")) {
      runTurn({});
    } else if (initial.project.status === "running") {
      // Reloaded mid-turn: the previous connection closed, which stops that turn server-side. Wait for it to settle.
      const iv = setInterval(async () => {
        const data = await refreshProject();
        if (data && data.project.status !== "running") {
          clearInterval(iv);
          setRunning(false);
        }
      }, 2500);
      return () => clearInterval(iv);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- canvas messages ----------
  const onCanvas = useCallback((m: BridgeOut) => {
    switch (m.t) {
      case "ready":
        setPages(m.pages);
        setTweaks(m.tweaks ?? []);
        setTweakValues(Object.fromEntries((m.tweaks ?? []).map((c) => [c.name, c.value])));
        break;
      case "pages":
        setPages(m.pages);
        break;
      case "pick":
        setPick({ id: m.id, tag: m.tag, text: m.text, html: m.html, rect: m.rect });
        break;
      case "select":
        setSel({ id: m.id, tag: m.tag, style: m.style });
        break;
      case "html":
        queueEdit(m.id, { html: m.html });
        break;
      case "cite": {
        const src = initial.sources.find((s) => s.id === m.src);
        if (src?.url) window.open(src.url, "_blank", "noopener");
        else fetch(`/api/projects/${project.id}`).then((r) => r.json()).then((d: ProjectData) => {
          const s = d.sources.find((x) => x.id === m.src);
          if (s?.url) window.open(s.url, "_blank", "noopener");
        });
        break;
      }
      case "escape":
        setPick(null);
        setSel(null);
        setMode("view");
        break;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function queueEdit(id: string, patch: { html?: string; style?: Record<string, any> }) {
    const cur = editQueue.current.get(id) ?? { id };
    editQueue.current.set(id, { ...cur, ...patch, style: patch.style ? { ...cur.style, ...patch.style } : cur.style });
    clearTimeout(editTimer.current);
    editTimer.current = setTimeout(flushEdits, 700);
  }

  async function flushEdits() {
    const path = activePathRef.current;
    const edits = [...editQueue.current.values()];
    editQueue.current.clear();
    if (!path || !edits.length) return;
    const res = await fetch(`/api/projects/${project.id}/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, edits }),
    });
    if (res.ok) bumpVersion(path, (await res.json()).version);
  }

  function bumpVersion(path: string, version: number) {
    setFiles((fs) =>
      fs.map((f) =>
        f.path === path && f.version !== version
          ? { ...f, version, updated_at: new Date().toISOString(), versions: [{ version, created_at: new Date().toISOString() }, ...f.versions] }
          : f
      )
    );
  }

  function styleEdit(patch: Partial<ElementStyle>) {
    if (!sel) return;
    setSel({ ...sel, style: { ...sel.style, ...patch } });
    canvas.current?.post({ t: "style", id: sel.id, style: patch });
    queueEdit(sel.id, { style: patch });
  }

  function changeTweak(name: string, value: any) {
    const next = { ...tweakValues, [name]: value };
    setTweakValues(next);
    canvas.current?.post({ t: "tweaks", values: { [name]: value } });
    clearTimeout(tweakTimer.current);
    const path = activePath;
    tweakTimer.current = setTimeout(async () => {
      if (!path) return;
      const res = await fetch(`/api/projects/${project.id}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, tweaks: next }),
      });
      if (res.ok) bumpVersion(path, (await res.json()).version);
    }, 800);
  }

  function changeMode(m: CanvasMode) {
    setMode(m);
    setPick(null);
    setSel(null);
    if (m !== "view") setChatOpen(true);
  }

  async function restore(version: number) {
    if (!activePath) return;
    const res = await fetch(`/api/projects/${project.id}/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: activePath, restore: version }),
    });
    if (!res.ok) return;
    bumpVersion(activePath, (await res.json()).version);
    setViewVersion(null);
    loadFile(activePath);
  }

  async function patchProject(update: Record<string, unknown>) {
    const res = await fetch(`/api/projects/${project.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(update) });
    return res.ok;
  }

  async function rename() {
    const title = prompt("Rename project", project.title)?.trim();
    if (title && (await patchProject({ title }))) setProject((p) => ({ ...p, title }));
  }

  async function deleteProject() {
    if (!confirm(`Delete “${project.title}”? Its files and history are removed for good.`)) return;
    const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    if (res.ok) router.push("/");
  }

  async function exportPdf() {
    if (!activePath) return;
    const res = await fetch(`/api/projects/${project.id}/file?path=${encodeURIComponent(activePath)}`);
    if (res.ok) printHtml((await res.json()).content);
  }

  function fullscreen() {
    changeMode("view");
    stage.current?.requestFullscreen?.().catch(() => {});
  }

  // ---------- geometry for overlays ----------
  const scale = zoom / 100;
  const pickPos = pick
    ? {
        x: Math.max(12, Math.min((stage.current?.clientWidth ?? 800) - 320, pick.rect.x * scale)),
        y: Math.max(12, Math.min((stage.current?.clientHeight ?? 600) - 200, (pick.rect.y + pick.rect.h) * scale + 10)),
      }
    : null;

  const drafting = draft != null && draft.path === activePath;
  const pageLabel = pages > 0 ? `${pages} page${pages > 1 ? "s" : ""}` : activeFile ? `v${viewVersion ?? activeFile.version}` : "";

  return (
    <div className={`workspace${chatOpen ? "" : " chat-closed"}`}>
      {chatOpen && (
        <aside className="chat">
          <div className="chat-head">
            <span className="proj-mark">D</span>
            <Popover
              className="grow"
              panelClassName="menu"
              trigger={(_o, toggle) => (
                <button type="button" className="proj-title" onClick={toggle} title={project.title}>
                  <span>{project.title}</span>
                  <IconChevronDown size={13} />
                </button>
              )}
              render={(close) => (
                <>
                  <MenuItem
                    onClick={() => {
                      close();
                      rename();
                    }}
                  >
                    Rename
                  </MenuItem>
                  <MenuItem onClick={() => router.push("/")}>All projects</MenuItem>
                  <div className="pop-sep" />
                  <MenuItem
                    danger
                    onClick={() => {
                      close();
                      deleteProject();
                    }}
                  >
                    Delete project
                  </MenuItem>
                </>
              )}
            />
            <button type="button" className="icon-btn" title="Hide chat" onClick={() => setChatOpen(false)}>
              <IconSidebar size={17} />
            </button>
            <button type="button" className="icon-btn" title="All projects" onClick={() => router.push("/")}>
              <IconHome size={16} />
            </button>
          </div>

          <div className="chat-scroll">
            <Thread
              rows={rows}
              running={running}
              liveText={liveText}
              liveReasoning={liveReasoning}
              activePath={activePath}
              onOpenFile={(path) => {
                setActivePath(path);
                setViewVersion(null);
              }}
              onAnswer={(text, answers) => send(text, { meta: { answers }, body: { answers } })}
            />
            <div ref={threadEnd} />
          </div>

          <div className="chat-composer">
            <div className="chat-composer-top">
              <DesignSystemPicker
                systems={dsList}
                value={project.design_system_id}
                variant="chip"
                side="top"
                onChange={async (id) => {
                  if (await patchProject({ design_system_id: id })) setProject((p) => ({ ...p, design_system_id: id }));
                }}
              />
              {project.codebase && (
                <span className="chip-static" title="Connected codebase">
                  {project.codebase}
                </span>
              )}
            </div>
            <AttachmentChips items={attachments} onRemove={(i) => setAttachments((a) => a.filter((_, j) => j !== i))} />
            <textarea
              className="chat-input"
              placeholder={files.length ? "Describe what you want to change…" : "Describe what you want to create…"}
              value={input}
              rows={3}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
            />
            <div className="chat-composer-row">
              <AttachButton onAdd={(a) => setAttachments((cur) => [...cur, ...a].slice(0, 5))} className="square-btn sm" />
              <span className="grow" />
              <ModelPicker
                models={models}
                value={project.model}
                variant="chip"
                side="top"
                onChange={async (key: ModelKey) => {
                  if (await patchProject({ model: key })) setProject((p) => ({ ...p, model: key }));
                }}
              />
              {running ? (
                <button type="button" className="btn-send stop" onClick={stop}>
                  <IconStop size={14} /> Stop
                </button>
              ) : (
                <button type="button" className="btn-send" onClick={() => send(input)} disabled={!input.trim() && !attachments.length}>
                  <IconArrowUp size={14} /> Send
                </button>
              )}
            </div>
          </div>
        </aside>
      )}

      <section className="stage-col">
        <div className="stage-card">
          <div className="stage-bar">
            <div className="bar-left">
              {!chatOpen && (
                <button type="button" className="icon-btn" title="Show chat" onClick={() => setChatOpen(true)}>
                  <IconSidebar size={17} />
                </button>
              )}
              <button type="button" className="icon-btn" title="Reload" onClick={() => activePath && loadFile(activePath, viewVersion)} disabled={!activePath}>
                <IconRefresh size={16} />
              </button>
              <button
                type="button"
                className={`icon-btn boxed${tweaksOpen ? " on" : ""}`}
                title={tweaks.length ? "Tweaks" : "This design has no tweaks yet — ask the agent to add some"}
                onClick={() => setTweaksOpen((v) => !v)}
                disabled={!tweaks.length}
              >
                <IconSliders size={16} />
              </button>
              <Popover
                panelClassName="menu files-menu"
                trigger={(_o, toggle) => (
                  <button type="button" className="file-title" onClick={toggle} disabled={!files.length}>
                    <span className="file-title-name">
                      {activePath ? activePath.replace(/\.html$/, "") : "No files yet"}
                      {files.length > 0 && <IconChevronDown size={13} />}
                    </span>
                    {pageLabel && <span className="file-title-sub">{pageLabel}</span>}
                  </button>
                )}
                render={(close) => (
                  <>
                    <div className="pop-label">Files</div>
                    {files.map((f) => (
                      <MenuItem
                        key={f.path}
                        active={f.path === activePath}
                        hint={<span suppressHydrationWarning>{relativeTime(f.updated_at)}</span>}
                        onClick={() => {
                          setActivePath(f.path);
                          setViewVersion(null);
                          close();
                        }}
                      >
                        {f.path.replace(/\.html$/, "")}
                      </MenuItem>
                    ))}
                    {activeFile && activeFile.versions.length > 1 && (
                      <>
                        <div className="pop-sep" />
                        <div className="pop-label">
                          <IconHistory size={12} /> Versions of {activePath?.replace(/\.html$/, "")}
                        </div>
                        <div className="versions-scroll">
                          {activeFile.versions.map((v, i) => (
                            <MenuItem
                              key={v.version}
                              active={(viewVersion ?? activeFile.version) === v.version}
                              hint={<span suppressHydrationWarning>{relativeTime(v.created_at)}</span>}
                              onClick={() => {
                                setViewVersion(i === 0 ? null : v.version);
                                close();
                              }}
                            >
                              Version {v.version}
                              {i === 0 ? " · latest" : ""}
                            </MenuItem>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}
              />
            </div>
            <div className="bar-right">
              <Popover
                align="right"
                panelClassName="menu narrow"
                trigger={(_o, toggle) => (
                  <button type="button" className="zoom-btn" onClick={toggle}>
                    {zoom}%
                  </button>
                )}
                render={(close) =>
                  ZOOMS.map((z) => (
                    <MenuItem
                      key={z}
                      active={z === zoom}
                      onClick={() => {
                        setZoom(z);
                        close();
                      }}
                    >
                      {z}%
                    </MenuItem>
                  ))
                }
              />
              <div className="modes">
                <button type="button" className={mode === "view" ? "on" : ""} title="Interact" onClick={() => changeMode("view")}>
                  <IconPointer size={15} />
                </button>
                <button type="button" className={mode === "comment" ? "on" : ""} disabled={!html || viewVersion != null || running} onClick={() => changeMode("comment")}>
                  <IconComment size={15} /> Comment
                </button>
                <button type="button" className={mode === "edit" ? "on" : ""} disabled={!html || viewVersion != null || running} onClick={() => changeMode("edit")}>
                  <IconPencil size={15} /> Edit
                </button>
              </div>
              <Popover
                align="right"
                panelClassName="menu"
                trigger={(_o, toggle) => (
                  <button type="button" className="present-btn" onClick={toggle} disabled={!activePath}>
                    Present <IconChevronDown size={13} />
                  </button>
                )}
                render={(close) => (
                  <>
                    <MenuItem
                      onClick={() => {
                        close();
                        fullscreen();
                      }}
                    >
                      <IconExpand size={14} /> Full screen
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        close();
                        window.open(`/api/projects/${project.id}/render?path=${encodeURIComponent(activePath ?? "")}`, "_blank");
                      }}
                    >
                      <IconExternal size={14} /> Open in new tab
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        close();
                        exportPdf();
                      }}
                    >
                      <IconDownload size={14} /> Save as PDF
                    </MenuItem>
                  </>
                )}
              />
              <button type="button" className="btn-share" onClick={() => setShareOpen(true)}>
                <IconShare size={14} /> Share
              </button>
              <span className="avatar">Y</span>
            </div>
          </div>

          {tweaksOpen && tweaks.length > 0 && <TweaksBar controls={tweaks} values={tweakValues} onChange={changeTweak} />}

          {viewVersion != null && activeFile && (
            <div className="version-banner">
              Viewing version {viewVersion} of {activeFile.version}
              <button type="button" className="btn-secondary sm" onClick={() => restore(viewVersion)}>
                Restore this version
              </button>
              <button type="button" className="btn-ghost sm" onClick={() => setViewVersion(null)}>
                Back to latest
              </button>
            </div>
          )}
          {mode !== "view" && !pick && !sel && (
            <div className="mode-hint">{mode === "comment" ? "Click anything on the canvas to comment on it" : "Click text to edit it, or adjust its style"} · Esc to exit</div>
          )}

          <div className="stage" ref={stage}>
            {html != null || drafting ? (
              <Canvas ref={canvas} html={html} docKey={docKey} draft={drafting ? draft!.html : null} mode={mode} zoom={zoom} onMessage={onCanvas} />
            ) : (
              <div className="stage-empty">
                {running ? (
                  <div className="stage-working">
                    <span className="pulse" />
                    <p>Designing…</p>
                  </div>
                ) : (
                  <p>{files.length ? "Loading…" : "Your designs will appear here."}</p>
                )}
              </div>
            )}
            {drafting && <div className="stage-badge">Writing {draft!.path}…</div>}
            {pick && pickPos && (
              <CommentPopover
                x={pickPos.x}
                y={pickPos.y}
                label={`<${pick.tag}>${pick.text ? ` “${pick.text.slice(0, 48)}${pick.text.length > 48 ? "…" : ""}”` : ""}`}
                onCancel={() => {
                  setPick(null);
                  canvas.current?.post({ t: "deselect" });
                }}
                onSubmit={(text) => {
                  const target = { id: pick.id, tag: pick.tag, text: pick.text, html: pick.html, path: activePath };
                  setPick(null);
                  setMode("view");
                  send(text, { meta: { target }, body: { target } });
                }}
              />
            )}
            {sel && mode === "edit" && (
              <EditPanel
                tag={sel.tag}
                style={sel.style}
                onStyle={styleEdit}
                onClose={() => {
                  setSel(null);
                  canvas.current?.post({ t: "deselect" });
                }}
                onAsk={() => {
                  setSel(null);
                  setMode("comment");
                }}
              />
            )}
          </div>
        </div>
      </section>

      {shareOpen && <ShareDialog projectId={project.id} path={activePath} onPrint={exportPdf} onClose={() => setShareOpen(false)} />}
    </div>
  );
}
