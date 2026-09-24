# Demonic Search

A Claude Design–style research and artifact engine: describe what you want, an
orchestrated team of agents researches the web with citations and writes a
finished HTML artifact (document, slides, diagram, or a cited research
report) onto a live canvas, exportable to PDF or standalone HTML.

It runs on OpenAI-compatible chat-completions endpoints (NVIDIA NIM /
DeepSeek) over raw HTTP — no vendor SDK — and uses **Supabase** for the
project/message database, the shared agent blackboard (sources, claims,
gaps), and the artifact file store (Storage). There are no user accounts:
every project is open to whoever has its URL, and the app talks to Supabase
entirely through the service-role client.

This implements the architecture from the attached research/build guide,
scoped to a working core + research pipeline (guide §§1–8, roughly the
"Core" + "Research" + "Collaboration" build-order milestones).

## Architecture

- **Client** — Next.js App Router. Home screen (composer + template picker +
  history), a per-project workspace with a chat/event log and a sandboxed
  `<iframe>` canvas, plus a clean read-only report view at `/p/[id]`.
- **App API** — Next.js route handlers under `app/api/*`. No auth: every
  route resolves a project through the Supabase service-role client
  (`lib/access.ts`) and returns 404 if it doesn't exist. Nothing scopes a
  project to a user — the `owner_id` columns are unused, kept only so the
  schema doesn't need another migration if accounts come back later.
- **Orchestrator** (`lib/orchestrator.ts`, `lib/agents/*`) — a blackboard
  (`lib/board.ts`) plus deterministic control flow: Planner → parallel
  Researchers → citation check → Critic → loop on high-priority gaps →
  Writer → Verifier. Budgets (tokens/searches/rounds) are enforced in code,
  not prompts.
- **Model gateway** (`lib/gateway.ts`) — a small `fetch` + SSE client with a
  model registry (`z-ai/glm-5.3`, `glm-5.3-flash`, `meta/muse-glimmer-30b`,
  Nemotron Omni, DeepSeek) and one-shot provider fallback.
- **Tools** — `lib/tools/tavily.ts` (web_search/web_fetch, with a per-project
  source registry so agents cite short IDs like `S3`, never raw URLs) and
  `lib/tools/files.ts` (write_file/str_replace/read_file, backed by the
  Supabase `artifacts` storage bucket + a `files` version table).
- **Render/export** — artifacts are plain HTML served from the public
  Storage bucket (an isolated origin from the app). `/api/projects/[id]/export`
  renders the same URL to PDF with headless Chromium (Playwright).

## Supabase project

A project named **demonic-search** (`gsoiexqtaiyjepzqyfso`) was created and
migrated with the schema below (see `supabase/migrations/0001_init.sql`):

- `profiles`, `design_systems`, `projects`, `messages`
- `sources`, `claims`, `gaps` (the blackboard's persisted state)
- `files` (artifact version metadata; bytes live in the `artifacts` Storage
  bucket, public-read / service-role-write)
- `events` (append-only agent event log, also streamed live over SSE)

RLS is still defined on every table (scoped to `owner_id`), but the app
itself never hits it — every request goes through the service-role client,
which bypasses RLS by design. It's dormant, not enforced.

## Setup

```bash
cp .env.example .env.local
# fill in SUPABASE_SERVICE_ROLE_KEY (Project Settings → API) and your
# NVIDIA_API_KEY / DEEPSEEK_API_KEY / TAVILY_API_KEY
npm install
npm run dev
```

No sign-in: describe what to build on Home, pick a template (Research
enables the citation pipeline), and submit. The workspace opens and starts
streaming the agent run. Anyone with a project's URL can open, run, chat
with, or edit it — there's no login and no ownership check.

## What's implemented vs. scoped out

Implemented: gateway + streaming tool calls, agent loop, blackboard on
Supabase, Tavily search/extract with source registry + citation checker,
Planner/Researcher/Critic/Writer/Verifier roles, budget guard, project
history, sandboxed canvas, HTML + PDF export, a research report laid out
from the board (citations, margin source notes, sources list) rather than
free-form Writer HTML, an Inspector for direct text/size/spacing edits and
Writer-routed edits on cited text, design systems (seeded starters plus
user-created ones) that drive a report's colors and fonts, and a read-only
share link.

Not implemented (see the guide's Wk 13+ "Refinement" milestone): PPTX
export, design-system ingestion from uploaded files (the drop zone on
Design systems is a placeholder), thumbnails.
