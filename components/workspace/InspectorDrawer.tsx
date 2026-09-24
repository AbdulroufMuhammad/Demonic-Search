import type { SelInfo } from "@/lib/workspaceTypes";

export default function InspectorDrawer({
  sel,
  onText,
  onFontSize,
  onLineHeight,
  onMarginBottom,
  onAsk,
  onClose,
}: {
  sel: SelInfo;
  onText: (text: string) => void;
  onFontSize: (n: number) => void;
  onLineHeight: (n: number) => void;
  onMarginBottom: (n: number) => void;
  onAsk: () => void;
  onClose: () => void;
}) {
  return (
    <div className="drawer drawer-inspect">
      <div className="drawer-head">
        <span className="drawer-tag">{sel.tag}</span>
        <button className="drawer-close" onClick={onClose}>
          ×
        </button>
      </div>
      {sel.locked ? (
        <p className="locked-note">
          This text carries citations, so it can&rsquo;t be edited directly. Ask the Writer and it will keep each
          citation attached to its claim.
        </p>
      ) : (
        <label className="field-label">
          <span>Text</span>
          <textarea className="field-textarea" value={sel.text} onChange={(e) => onText(e.target.value)} rows={3} />
        </label>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label className="slider-field">
          <span className="slider-row">
            <span>Size</span>
            <span className="slider-value">{sel.fs}px</span>
          </span>
          <input type="range" min={10} max={72} step={1} value={sel.fs} onChange={(e) => onFontSize(Number(e.target.value))} />
        </label>
        <label className="slider-field">
          <span className="slider-row">
            <span>Line height</span>
            <span className="slider-value">{sel.lh}</span>
          </span>
          <input type="range" min={1} max={2.2} step={0.05} value={sel.lh} onChange={(e) => onLineHeight(Number(e.target.value))} />
        </label>
        <label className="slider-field">
          <span className="slider-row">
            <span>Space after</span>
            <span className="slider-value">{sel.mb}px</span>
          </span>
          <input type="range" min={0} max={64} step={2} value={sel.mb} onChange={(e) => onMarginBottom(Number(e.target.value))} />
        </label>
      </div>
      <button className="btn-ask" onClick={onAsk}>
        Ask the Writer about this →
      </button>
    </div>
  );
}
