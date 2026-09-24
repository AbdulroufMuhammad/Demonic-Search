import type { SupabaseClient } from "@supabase/supabase-js";
import { fromRow, type DesignSystem } from "@/lib/designSystems";

export type Facet = { id: string; question: string };
export type Plan = { facets: Facet[]; outline: { heading: string }[] };
export type Claim = {
  id: string;
  text: string;
  facetId?: string;
  sourceIds: string[];
  quote: string;
  confidence?: number;
  ok?: boolean;
};
export type Gap = { facetId?: string; question: string; priority: "high" | "medium" | "low" };
export type Budget = { tokensLeft: number; searchesLeft: number; rounds: number; maxRounds: number };

export class BudgetExceeded extends Error {}

/**
 * Thin wrapper over the Supabase tables that make up the shared blackboard:
 * projects (goal/plan/budget), sources, claims, gaps, files, events.
 * The orchestrator and every agent role read/write through this, never the
 * raw tables directly, so the schema can change without touching agent code.
 */
export class Board {
  sources = new Map<string, { url: string; title?: string; text?: string; facetId?: string }>();
  claims: Claim[] = [];
  /** Claims whose quote was not found in the source text. Kept for the report's "Excluded" note. */
  dropped: Claim[] = [];
  designSystem: DesignSystem | null = null;
  gaps: Gap[] = [];
  plan: Plan | null = null;
  budget: Budget;

  constructor(
    private db: SupabaseClient,
    public projectId: string,
    public goal: string,
    public template: string,
    budget: Budget
  ) {
    this.budget = budget;
  }

  static async load(db: SupabaseClient, projectId: string): Promise<Board> {
    const { data: project, error } = await db
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();
    if (error || !project) throw new Error(`project not found: ${projectId}`);

    const board = new Board(db, projectId, project.goal ?? "", project.template, project.budget);
    board.plan = project.plan;
    if (project.design_system_id) {
      const { data: ds } = await db
        .from("design_systems")
        .select("*")
        .eq("id", project.design_system_id)
        .single();
      if (ds) board.designSystem = fromRow(ds);
    }

    const [{ data: sources }, { data: claims }, { data: gaps }] = await Promise.all([
      db.from("sources").select("*").eq("project_id", projectId),
      db.from("claims").select("*").eq("project_id", projectId),
      db.from("gaps").select("*").eq("project_id", projectId).eq("resolved", false),
    ]);
    for (const s of sources ?? []) {
      board.sources.set(s.short_id, {
        url: s.url,
        title: s.title ?? undefined,
        text: s.text ?? undefined,
        facetId: s.facet_id ?? undefined,
      });
    }
    const all = (claims ?? []).map((c) => ({
      id: c.id,
      text: c.text,
      facetId: c.facet_id ?? undefined,
      sourceIds: c.source_ids ?? [],
      quote: c.quote ?? "",
      confidence: c.confidence ?? undefined,
      ok: c.ok ?? undefined,
    }));
    board.claims = all.filter((c) => c.ok !== false);
    board.dropped = all.filter((c) => c.ok === false);
    board.gaps = (gaps ?? []).map((g) => ({
      facetId: g.facet_id ?? undefined,
      question: g.question,
      priority: g.priority as Gap["priority"],
    }));
    return board;
  }

  registerSource(url: string, title?: string, text?: string, facetId?: string): string {
    for (const [id, s] of this.sources) if (s.url === url) return id;
    const id = `S${this.sources.size + 1}`;
    this.sources.set(id, { url, title, text, facetId });
    return id;
  }

  async persistSource(shortId: string) {
    const s = this.sources.get(shortId);
    if (!s) return;
    await this.db.from("sources").upsert(
      {
        project_id: this.projectId,
        short_id: shortId,
        url: s.url,
        title: s.title,
        text: s.text,
        facet_id: s.facetId ?? null,
        fetched_at: s.text ? new Date().toISOString() : null,
      },
      { onConflict: "project_id,short_id" }
    );
  }

  spend(kind: "search" | "extract" | "tokens", amount = 1) {
    if (kind === "search" || kind === "extract") this.budget.searchesLeft -= amount;
    if (kind === "tokens") this.budget.tokensLeft -= amount;
    this.guard();
  }

  meter(usage: { total_tokens?: number } | null) {
    if (usage?.total_tokens) this.budget.tokensLeft -= usage.total_tokens;
  }

  guard() {
    if (this.budget.searchesLeft <= 0) throw new BudgetExceeded("search budget exhausted");
    if (this.budget.tokensLeft <= 0) throw new BudgetExceeded("token budget exhausted");
  }

  async checkpoint() {
    await this.db
      .from("projects")
      .update({ plan: this.plan, budget: this.budget, updated_at: new Date().toISOString() })
      .eq("id", this.projectId);
  }

  async mergeClaims(claims: Claim[]) {
    const seen = new Set(
      [...this.claims, ...this.dropped].map((c) => `${c.sourceIds.join(",")}::${c.quote}`)
    );
    for (const c of claims) {
      const key = `${c.sourceIds.join(",")}::${c.quote}`;
      if (seen.has(key)) continue;
      seen.add(key);
      this.claims.push(c);
    }
  }

  async persistClaims() {
    const all = [...this.claims, ...this.dropped];
    if (!all.length) return;
    await this.db.from("claims").delete().eq("project_id", this.projectId);
    await this.db.from("claims").insert(
      all.map((c) => ({
        project_id: this.projectId,
        facet_id: c.facetId,
        text: c.text,
        quote: c.quote,
        source_ids: c.sourceIds,
        confidence: c.confidence,
        ok: c.ok,
      }))
    );
  }

  /** Gaps from earlier rounds are marked resolved (not deleted) so the board can show them. */
  async persistGaps() {
    await this.db
      .from("gaps")
      .update({ resolved: true })
      .eq("project_id", this.projectId)
      .eq("resolved", false);
    if (this.gaps.length) {
      await this.db.from("gaps").insert(
        this.gaps.map((g) => ({
          project_id: this.projectId,
          facet_id: g.facetId,
          question: g.question,
          priority: g.priority,
        }))
      );
    }
  }
}
