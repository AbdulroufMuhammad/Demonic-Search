import type { BoardData } from "@/lib/projectData";

const PRI_COLOR = (p: string) => (p === "high" ? "var(--accent)" : "var(--muted)");

export default function BoardView({ board }: { board: BoardData }) {
  const counts = { s: board.sources.length, c: board.claims.length, g: board.gaps.length };
  const lanes = board.facets.map((f, i) => ({
    n: `Q${i + 1}`,
    q: f.question,
    sources: board.sources.filter((s) => s.facetId === f.id),
    claims: board.claims.filter((c) => c.facetId === f.id),
    gaps: board.gaps.filter((g) => g.facetId === f.id),
  }));

  return (
    <div className="board-wrap">
      <div className="board-head">
        <h2>Research board</h2>
        <span className="board-counts">
          {counts.s} sources · {counts.c} claims · {counts.g} gaps
        </span>
      </div>
      {!lanes.length && <div className="board-empty">The planner is splitting the goal into questions…</div>}
      {lanes.map((ln) => (
        <div key={ln.n} className="lane">
          <div className="lane-q">
            <span className="lane-q-n">{ln.n}</span>
            <span className="lane-q-text">{ln.q}</span>
            {ln.gaps.map((g) => (
              <span key={g.id} className="lane-gap" style={{ color: PRI_COLOR(g.priority), opacity: g.resolved ? 0.55 : 1 }}>
                Gap · {g.question} ({g.resolved ? "Resolved" : "Open"})
              </span>
            ))}
          </div>
          <div className="lane-col">
            <span className="lane-col-label">Sources</span>
            {ln.sources.map((s) => (
              <div key={s.id} className="lane-source">
                <span className="lane-source-id">{s.id}</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span className="lane-source-title">{s.title}</span>
                  <span className="lane-source-state" style={{ color: "var(--text)" }}>
                    {s.url.replace(/^https?:\/\//, "").split("/")[0]}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="lane-col">
            <span className="lane-col-label">Claims</span>
            {!ln.claims.length && <span className="lane-empty">Researcher is reading…</span>}
            {ln.claims.map((c) => (
              <div key={c.id} className="lane-claim" style={{ opacity: c.ok === false ? 0.55 : 1 }}>
                <span className="lane-claim-text" style={{ textDecoration: c.ok === false ? "line-through" : "none" }}>
                  {c.text}
                </span>
                <span className="lane-claim-quote">&ldquo;{c.quote}&rdquo;</span>
                <div className="lane-claim-meta">
                  <span style={{ color: "var(--muted)" }}>
                    {c.sourceIds.join(", ")} · {c.confidence != null ? Math.round(c.confidence * 100) + "%" : ""}
                  </span>
                  <span style={{ color: c.ok === false ? "var(--danger)" : "var(--accent)" }}>
                    {c.ok === false ? "Dropped: quote not found" : "Verified"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
