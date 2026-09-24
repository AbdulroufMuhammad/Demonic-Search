import type { BoardData } from "@/lib/projectData";

export default function SourceDrawer({
  sourceId,
  board,
  citeNumber,
  onClose,
}: {
  sourceId: string;
  board: BoardData;
  citeNumber: (id: string) => number;
  onClose: () => void;
}) {
  const source = board.sources.find((s) => s.id === sourceId);
  if (!source) return null;
  const claims = board.claims.filter((c) => c.sourceIds.includes(sourceId));

  return (
    <div className="drawer drawer-source">
      <div className="drawer-head">
        <span className="src-badge">Source {citeNumber(sourceId)}</span>
        <button className="drawer-close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="src-title-block">
        <span className="src-title">{source.title}</span>
        <span className="src-url">{source.url}</span>
      </div>
      <span className="src-claims-label">Claims from this source</span>
      {claims.map((c) => (
        <div key={c.id} className="src-claim">
          <span className="src-claim-text">{c.text}</span>
          <span className="src-claim-quote">&ldquo;{c.quote}&rdquo;</span>
          <span className="src-claim-meta" style={{ color: c.ok === false ? "var(--danger)" : "var(--paper-ink)" }}>
            {c.ok === false ? "Dropped" : "Verified"} · quote matched
            {c.confidence != null ? ` · confidence ${Math.round(c.confidence * 100)}%` : ""}
          </span>
        </div>
      ))}
      {!claims.length && <span style={{ fontSize: 13, color: "var(--paper-muted)" }}>No claims cite this source.</span>}
    </div>
  );
}
