"use client";

import { useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Canvas, { type CanvasHandle } from "@/components/project/Canvas";
import { downloadPdf } from "@/lib/print";
import { IconDownload, IconExpand } from "@/components/ui/Icons";

export default function PublicView({ projectId, title, files, path, html }: { projectId: string; title: string; files: string[]; path: string | null; html: string | null }) {
  const router = useRouter();
  const canvas = useRef<CanvasHandle>(null);
  const stage = useRef<HTMLDivElement>(null);
  return (
    <div className="public">
      <header className="public-bar">
        <Link href="/" className="brand small">
          <span className="brand-name">Demonic Search</span>
        </Link>
        <span className="public-title">{title}</span>
        {files.length > 1 && (
          <select value={path ?? ""} onChange={(e) => router.push(`/p/${projectId}?file=${encodeURIComponent(e.target.value)}`)}>
            {files.map((f) => (
              <option key={f} value={f}>
                {f.replace(/\.html$/, "")}
              </option>
            ))}
          </select>
        )}
        <span className="grow" />
        {html && (
          <>
            <button type="button" className="btn-ghost sm" onClick={() => stage.current?.requestFullscreen?.().catch(() => {})}>
              <IconExpand size={14} /> Full screen
            </button>
            <button type="button" className="btn-ghost sm" onClick={() => path && downloadPdf(projectId, path, html)}>
              <IconDownload size={14} /> PDF
            </button>
          </>
        )}
        <Link href={`/project/${projectId}`} className="btn-secondary sm">
          Open project
        </Link>
      </header>
      <div className="public-stage" ref={stage}>
        {html ? (
          <Canvas ref={canvas} html={html} docKey={path ?? ""} draft={null} mode="view" zoom={100} onMessage={() => {}} />
        ) : (
          <p className="stage-empty">This project doesn&rsquo;t have any designs yet.</p>
        )}
      </div>
    </div>
  );
}
