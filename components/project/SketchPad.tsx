"use client";

import { useEffect, useRef, useState } from "react";
import { IconClose } from "@/components/ui/Icons";

type Stroke = { color: string; size: number; erase: boolean; points: [number, number][] };

const W = 1400;
const H = 900;
const COLORS = ["#1d1b18", "#d9543a", "#2f6fdb", "#2f9e66", "#e0a526"];
const SIZES = [3, 6, 12];

/**
 * A quick sketch (a layout idea, a wireframe, an arrow on a screenshot) that
 * goes to the agent as an image, like any other attachment.
 */
export default function SketchPad({ onSave, onClose }: { onSave: (png: Blob) => Promise<void> | void; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [erase, setErase] = useState(false);
  const [saving, setSaving] = useState(false);
  const drawing = useRef<Stroke | null>(null);

  // Redraw everything on a white page whenever the strokes change.
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    for (const s of [...strokes, ...(drawing.current ? [drawing.current] : [])]) paint(ctx, s);
  }, [strokes]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        setStrokes((s) => s.slice(0, -1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function at(e: React.PointerEvent): [number, number] {
    const r = canvas.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  }

  function down(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = { color, size: erase ? size * 4 : size, erase, points: [at(e)] };
  }
  function move(e: React.PointerEvent) {
    const s = drawing.current;
    if (!s) return;
    s.points.push(at(e));
    const ctx = canvas.current?.getContext("2d");
    if (ctx) paint(ctx, { ...s, points: s.points.slice(-2) });
  }
  function up() {
    const s = drawing.current;
    drawing.current = null;
    if (s) setStrokes((all) => [...all, s]);
  }

  async function save() {
    if (!canvas.current || !strokes.length) return;
    setSaving(true);
    const blob = await new Promise<Blob | null>((r) => canvas.current!.toBlob(r, "image/png"));
    if (blob) await onSave(blob);
    setSaving(false);
  }

  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sketch" role="dialog" aria-label="New sketch">
        <div className="sketch-bar">
          <strong>New sketch</strong>
          <div className="sketch-tools">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`sketch-color${!erase && color === c ? " on" : ""}`}
                style={{ background: c }}
                aria-label={`Pen color ${c}`}
                onClick={() => {
                  setColor(c);
                  setErase(false);
                }}
              />
            ))}
            <span className="sketch-sep" />
            {SIZES.map((s) => (
              <button key={s} type="button" className={`sketch-size${size === s ? " on" : ""}`} onClick={() => setSize(s)} aria-label={`Pen size ${s}`}>
                <i style={{ width: s + 2, height: s + 2 }} />
              </button>
            ))}
            <span className="sketch-sep" />
            <button type="button" className={`btn-ghost sm${erase ? " on" : ""}`} onClick={() => setErase((v) => !v)}>
              Eraser
            </button>
            <button type="button" className="btn-ghost sm" onClick={() => setStrokes((s) => s.slice(0, -1))} disabled={!strokes.length}>
              Undo
            </button>
            <button type="button" className="btn-ghost sm" onClick={() => setStrokes([])} disabled={!strokes.length}>
              Clear
            </button>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <IconClose size={16} />
          </button>
        </div>
        <canvas
          ref={canvas}
          width={W}
          height={H}
          className="sketch-canvas"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
        <div className="sketch-foot">
          <span className="muted">Draw a layout, a flow or a quick idea. It&apos;s attached to your next message for the agent to work from.</span>
          <button type="button" className="btn-accent" onClick={save} disabled={!strokes.length || saving}>
            {saving ? <span className="spinner" /> : null} Attach sketch
          </button>
        </div>
      </div>
    </div>
  );
}

function paint(ctx: CanvasRenderingContext2D, s: Stroke) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = s.size;
  ctx.strokeStyle = s.erase ? "#ffffff" : s.color;
  ctx.beginPath();
  s.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  if (s.points.length === 1) ctx.lineTo(s.points[0][0] + 0.1, s.points[0][1]);
  ctx.stroke();
  ctx.restore();
}
