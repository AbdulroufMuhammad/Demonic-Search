"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A trigger plus a floating panel that closes on outside click or Escape.
 * `render` gets a close() so menu items can dismiss it.
 */
export default function Popover({
  trigger,
  render,
  align = "left",
  side = "bottom",
  className = "",
  panelClassName = "",
}: {
  trigger: (open: boolean, toggle: () => void) => ReactNode;
  render: (close: () => void) => ReactNode;
  align?: "left" | "right";
  side?: "bottom" | "top";
  className?: string;
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`pop ${className}`} ref={ref}>
      {trigger(open, () => setOpen((v) => !v))}
      {open && <div className={`pop-panel pop-${side} pop-${align} ${panelClassName}`}>{render(() => setOpen(false))}</div>}
    </div>
  );
}

export function MenuItem({
  children,
  onClick,
  active,
  danger,
  hint,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  hint?: ReactNode;
}) {
  return (
    <button type="button" className={`menu-item${active ? " active" : ""}${danger ? " danger" : ""}`} onClick={onClick}>
      <span className="menu-item-label">{children}</span>
      {hint != null && <span className="menu-item-hint">{hint}</span>}
    </button>
  );
}
