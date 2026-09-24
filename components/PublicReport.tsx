"use client";

import { useMemo, useState } from "react";
import ReportCanvas from "@/components/workspace/ReportCanvas";
import SourceDrawer from "@/components/workspace/SourceDrawer";
import type { BoardData } from "@/lib/projectData";

/** The read-only /p/[id] view: the report, with citations still clickable. No Inspect, no chat. */
export default function PublicReport({ html, board }: { html: string; board: BoardData }) {
  const [selSourceId, setSelSourceId] = useState<string | null>(null);

  const citeOrder = useMemo(() => {
    const map = new Map<string, number>();
    if (typeof window === "undefined") return map;
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll(".r-sources li[data-src]").forEach((el, i) => map.set(el.getAttribute("data-src")!, i + 1));
    return map;
  }, [html]);
  const citeNumber = (id: string) => citeOrder.get(id) ?? board.sources.findIndex((s) => s.id === id) + 1;

  return (
    <div className="canvas-col" style={{ minHeight: "100vh" }}>
      <div className="canvas-body">
        <div className="report-frame-wrap">
          <ReportCanvas html={html} inspect={false} selectedId={null} onCite={setSelSourceId} onSelect={() => {}} />
        </div>
        {selSourceId && <SourceDrawer sourceId={selSourceId} board={board} citeNumber={citeNumber} onClose={() => setSelSourceId(null)} />}
      </div>
    </div>
  );
}
