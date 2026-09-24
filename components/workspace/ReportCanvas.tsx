"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { buildSrcDoc } from "@/lib/reportBridge";
import type { SelInfo } from "@/lib/workspaceTypes";

export type ReportCanvasHandle = {
  pushStyle: (id: string, style: { fontSize?: number; lineHeight?: number; marginBottom?: number }) => void;
  pushText: (id: string, text: string) => void;
};

/**
 * Renders the artifact in a sandboxed (srcdoc, opaque-origin) iframe and
 * bridges Inspect-mode selection and citation clicks over postMessage — see
 * lib/reportBridge.ts for the injected script and the message shapes.
 */
const ReportCanvas = forwardRef<
  ReportCanvasHandle,
  {
    html: string;
    inspect: boolean;
    selectedId: string | null;
    onCite: (src: string) => void;
    onSelect: (sel: SelInfo) => void;
  }
>(function ReportCanvas({ html, inspect, selectedId, onCite, onSelect }, ref) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);
  const inspectRef = useRef(inspect);
  const selectedRef = useRef(selectedId);
  const onCiteRef = useRef(onCite);
  const onSelectRef = useRef(onSelect);
  inspectRef.current = inspect;
  selectedRef.current = selectedId;
  onCiteRef.current = onCite;
  onSelectRef.current = onSelect;

  const srcDoc = useMemo(() => buildSrcDoc(html), [html]);

  function send(msg: unknown) {
    if (!readyRef.current) return;
    iframeRef.current?.contentWindow?.postMessage(msg, "*");
  }

  useImperativeHandle(ref, () => ({
    pushStyle: (id, style) => send({ t: "style", id, style }),
    pushText: (id, text) => send({ t: "text", id, text }),
  }));

  useEffect(() => {
    readyRef.current = false;
    function onMessage(e: MessageEvent) {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const m = e.data;
      if (!m || typeof m !== "object") return;
      if (m.t === "ready") {
        readyRef.current = true;
        send({ t: "inspect", on: inspectRef.current });
        if (selectedRef.current) send({ t: "select", id: selectedRef.current });
      } else if (m.t === "cite") {
        onCiteRef.current(m.src);
      } else if (m.t === "select") {
        onSelectRef.current({ id: m.id, tag: m.tag, text: m.text, locked: m.locked, fs: m.fs, lh: m.lh, mb: m.mb });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcDoc]);

  useEffect(() => {
    send({ t: "inspect", on: inspect });
  }, [inspect]);
  useEffect(() => {
    send({ t: "select", id: selectedId });
  }, [selectedId]);

  return <iframe ref={iframeRef} className="report-iframe" sandbox="allow-scripts" srcDoc={srcDoc} title="Report" />;
});

export default ReportCanvas;
