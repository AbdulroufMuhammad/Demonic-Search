"use client";

import { useRef, useState } from "react";
import Popover, { MenuItem } from "@/components/ui/Popover";
import { IconClose, IconCode, IconFile, IconPlus } from "@/components/ui/Icons";

/** Text files carry `content`; images carry a public `url` the agent can also use in designs. */
export type Attachment = { name: string; kind?: "text" | "image" | "folder"; content?: string; url?: string };

const MAX_TEXT_BYTES = 200_000;
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|html?|css|scss|less|jsx?|tsx?|mjs|svg|xml|ya?ml|toml|vue|svelte|astro)$/i;
const IMAGE_TYPES = /^image\/(png|jpeg|webp|gif)$/;
const MAX_IMAGE_SIDE = 1600;

// A local codebase: only the files that describe how the UI looks, within a size budget.
const FOLDER_SKIP = /(^|\/)(node_modules|\.git|\.next|dist|build|out|coverage|vendor|\.turbo|\.vercel)(\/|$)/;
const FOLDER_KEEP = /(\.(css|scss|less|tsx|jsx|vue|svelte|astro|html)$)|((tailwind|theme|tokens)[^/]*\.(js|ts|cjs|mjs|json)$)|(package\.json$)/i;
const FOLDER_MAX_FILES = 60;
const FOLDER_MAX_CHARS = 300_000;

async function downscale(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  // PNG keeps transparency (logos, icons); photos are smaller as JPEG.
  return file.type === "image/png" ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.85);
}

async function uploadImage(file: File): Promise<Attachment> {
  const res = await fetch("/api/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name || "pasted-image.png", dataUrl: await downscale(file) }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Upload failed");
  return { kind: "image", name: data.name, url: data.url };
}

/** Turn picked, dropped or pasted files into attachments: images are uploaded, text files are read. */
export async function filesToAttachments(files: File[]): Promise<Attachment[]> {
  const out: Attachment[] = [];
  for (const f of files.slice(0, 5)) {
    if (IMAGE_TYPES.test(f.type)) out.push(await uploadImage(f));
    else if (TEXT_EXT.test(f.name) && f.size <= MAX_TEXT_BYTES) out.push({ kind: "text", name: f.name, content: await f.text() });
  }
  return out;
}

async function folderToAttachment(files: File[]): Promise<Attachment | null> {
  const picked = files
    .map((f) => ({ f, path: (f as any).webkitRelativePath || f.name }))
    .filter(({ path, f }) => !FOLDER_SKIP.test(path) && FOLDER_KEEP.test(path) && f.size <= MAX_TEXT_BYTES)
    .sort((a, b) => a.path.length - b.path.length)
    .slice(0, FOLDER_MAX_FILES);
  if (!picked.length) return null;
  let content = "";
  for (const { f, path } of picked) {
    const text = await f.text();
    if (content.length + text.length > FOLDER_MAX_CHARS) break;
    content += `\n\n===== ${path} =====\n${text}`;
  }
  const root = String(picked[0].path).split("/")[0] || "folder";
  return { kind: "folder", name: `${root}/ (${picked.length} UI files)`, content: content.trim() };
}

export function AttachButton({ onAdd, className = "icon-btn" }: { onAdd: (a: Attachment[]) => void; className?: string }) {
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handle(list: File[], asFolder: boolean) {
    if (!list.length) return;
    setBusy(true);
    try {
      if (asFolder) {
        const a = await folderToAttachment(list);
        if (a) onAdd([a]);
        else alert("No UI files (CSS, components, theme or Tailwind config) were found in that folder.");
      } else {
        onAdd(await filesToAttachments(list));
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Popover
        side="top"
        panelClassName="menu"
        trigger={(_o, toggle) => (
          <button type="button" className={className} title="Attach images, files or a code folder" onClick={toggle} disabled={busy}>
            {busy ? <span className="spinner" /> : <IconPlus size={18} />}
          </button>
        )}
        render={(close) => (
          <>
            <MenuItem
              onClick={() => {
                close();
                files.current?.click();
              }}
              hint="PNG, JPG, text"
            >
              <IconFile size={14} /> Images or files
            </MenuItem>
            <MenuItem
              onClick={() => {
                close();
                folder.current?.click();
              }}
              hint="local codebase"
            >
              <IconCode size={14} /> Code folder
            </MenuItem>
          </>
        )}
      />
      <input
        ref={files}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif,.txt,.md,.csv,.tsv,.json,.html,.htm,.css,.js,.jsx,.ts,.tsx,.svg,.xml,.yaml,.yml"
        hidden
        onChange={(e) => {
          handle([...(e.target.files ?? [])], false);
          e.target.value = "";
        }}
      />
      <input
        ref={folder}
        type="file"
        hidden
        // @ts-expect-error non-standard but supported by every current browser
        webkitdirectory=""
        onChange={(e) => {
          handle([...(e.target.files ?? [])], true);
          e.target.value = "";
        }}
      />
    </>
  );
}

/** Paste images straight into a composer. */
export function pastedImages(e: React.ClipboardEvent): File[] {
  return [...e.clipboardData.files].filter((f) => IMAGE_TYPES.test(f.type));
}

export function AttachmentChips({ items, onRemove }: { items: Attachment[]; onRemove?: (i: number) => void }) {
  if (!items.length) return null;
  return (
    <div className="attach-chips">
      {items.map((a, i) =>
        a.kind === "image" && a.url ? (
          <span key={i} className="attach-chip image" title={a.name}>
            <a href={a.url} target="_blank" rel="noreferrer">
              <img src={a.url} alt={a.name} />
            </a>
            {onRemove && (
              <button type="button" onClick={() => onRemove(i)} aria-label={`Remove ${a.name}`}>
                <IconClose size={11} />
              </button>
            )}
          </span>
        ) : (
          <span key={i} className="attach-chip">
            {a.kind === "folder" ? <IconCode size={13} /> : <IconFile size={13} />}
            {a.name}
            {onRemove && (
              <button type="button" onClick={() => onRemove(i)} aria-label={`Remove ${a.name}`}>
                <IconClose size={11} />
              </button>
            )}
          </span>
        )
      )}
    </div>
  );
}
