"use client";

import { useRef } from "react";
import { IconClose, IconFile, IconPlus } from "@/components/ui/Icons";

export type Attachment = { name: string; content: string };

const MAX_BYTES = 200_000;
const ACCEPT = ".txt,.md,.markdown,.csv,.tsv,.json,.html,.htm,.css,.js,.jsx,.ts,.tsx,.svg,.xml,.yaml,.yml";

/** Attach text files (briefs, copy, data, existing HTML) as context for the agent. */
export function AttachButton({ onAdd, className = "icon-btn" }: { onAdd: (a: Attachment[]) => void; className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={className} title="Attach text files" onClick={() => input.current?.click()}>
        <IconPlus size={18} />
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        hidden
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])].filter((f) => f.size <= MAX_BYTES).slice(0, 5);
          const read = await Promise.all(files.map(async (f) => ({ name: f.name, content: await f.text() })));
          if (read.length) onAdd(read);
          e.target.value = "";
        }}
      />
    </>
  );
}

export function AttachmentChips({ items, onRemove }: { items: Attachment[]; onRemove?: (i: number) => void }) {
  if (!items.length) return null;
  return (
    <div className="attach-chips">
      {items.map((a, i) => (
        <span key={i} className="attach-chip">
          <IconFile size={13} />
          {a.name}
          {onRemove && (
            <button type="button" onClick={() => onRemove(i)} aria-label={`Remove ${a.name}`}>
              <IconClose size={11} />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
