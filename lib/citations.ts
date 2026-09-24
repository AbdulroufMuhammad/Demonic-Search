import type { Board } from "@/lib/board";

function normalize(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * For each claim, confirm the quoted span actually exists in the stored
 * source text. Claims that fail are dropped rather than sent to the Writer
 * (guide §5/§6) — this is what keeps every citation resolvable. Dropped
 * claims are kept on board.dropped so the UI can show what was excluded.
 */
export function verifyCitations(board: Board) {
  const newlyDropped = [];
  for (const c of board.claims) {
    c.ok = c.sourceIds.some((id) => {
      const src = board.sources.get(id);
      return !!src?.text && normalize(src.text).includes(normalize(c.quote));
    });
    if (!c.ok) newlyDropped.push(c);
  }
  board.claims = board.claims.filter((c) => c.ok);
  board.dropped.push(...newlyDropped);
  return newlyDropped;
}
