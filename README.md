# Demonic Search

A Claude Design–style design tool on open models. Describe what you want,
pick a template and design system, and a design agent builds it live on a
canvas — then you iterate by chatting, commenting on elements, editing text
and type directly, or sliding the design's own tweak controls. Exports to PDF
(via the browser's print dialog) or standalone HTML.

It runs on OpenAI-compatible chat-completions endpoints (NVIDIA NIM /
DeepSeek) over raw HTTP — no vendor SDK — with **Supabase** for projects,
messages, the agent event log, web sources and versioned design files
(Storage). There are no user accounts: every project is open to whoever has
its URL, and the app talks to Supabase through the service-role client.

## How it works

- **Home** (`app/page.tsx`, `components/home/*`) — composer with a design
  system picker, model picker and GitHub codebase picker; a template grid
  (Blank, Mobile app, Slides, Document, Wireframe, Animation, UI mockups,
  Résumé, 3D object, Landing page, Design system, Research, HTML email,
  Color + type pairing); and a projects table/grid with live thumbnails.
  Picking a template (other than Blank) prefills the prompt with a complete
  request and that template's own step-by-step process (`lib/templates.ts`);
  the example subject is selected so typing replaces it, and it carries over
  when you switch templates.
- **Workspace** (`components/project/*`) — the same for every project: chat on
  the left, canvas on the right. A template is only a hint to the agent; it
  never changes the UI.
- **Design agent** (`lib/agent.ts`) — one conversational tool-use loop per
  message. Tools: `write_file` / `str_replace` / `read_file` (versioned HTML
  files), `web_search` / `web_fetch` (Tavily, cited by short source IDs),
  `repo_tree` / `repo_read` (the connected GitHub codebase), and
  `ask_questions` (a short brief rendered as a form). It narrates each step,
  which the chat shows as activity rows, and the file being written streams to
  the canvas as it's generated.
- **Design systems** — when a project makes a design system (the Design system
  template, or asking for one), it's saved to the design system picker and
  applied to the project. The agent saves it with `save_design_system`; if it
  doesn't, the tokens are read from the spec file's CSS variables and fonts
  (`lib/extractDesignSystem.ts`). Later revisions of that spec update the same
  saved system instead of adding copies.
- **Visual check** (`lib/tools/visualCheck.ts`) — the agent's `check_design`
  tool renders a file in headless Chromium (`@sparticuz/chromium` on Vercel),
  runs automatic checks (JS errors, sideways overflow at desktop and phone
  widths, broken images, low-contrast and clipped text), and sends screenshots
  to a vision model (Nemotron Omni, falling back to Muse Glimmer). The agent
  fixes what's found; the chat shows the screenshot and findings, and the
  canvas toolbar has a Check button to run it on demand.
- **Attachments** — images (downscaled in the browser, stored in Storage) are
  described once by the vision model so the text model can design from them,
  and can be placed in designs; text files and a local code folder's UI files
  (CSS, components, theme/Tailwind config) are passed as context. Paste images
  straight into the composer, or dictate with the mic button.
- **Comments** — each comment stays pinned to its element (numbered pins in
  Comment mode) with the agent's reply, until you resolve it.
- **Present & export** — Present slides shows one slide at a time full screen
  with speaker notes; Share exports PDF (print), PNG, PowerPoint (one image per
  slide, with notes) and HTML, and copies a Claude Code handoff prompt.
- **Long chats** — the last 12 messages go to the model verbatim; older ones as
  a cached summary. Each turn has a research allowance, and models fall back
  GLM → GLM Flash → DeepSeek, skipping a provider whose key was rejected.
- **Canvas** (`components/project/Canvas.tsx`, `lib/canvasBridge.ts`) — designs
  run in an iframe sandboxed without `allow-same-origin`; a small injected
  bridge handles Comment mode (click anything → comment goes to the agent with
  that element's HTML), Edit mode (type in place, size/leading/spacing/weight/
  color/alignment), tweaks, page counting and streamed drafts.
- **Tweaks** — the agent declares live controls in the file
  (`<script type="application/json" id="tweaks">`); the canvas applies them as
  CSS variables, `data-*` attributes and a `tweak` event, and saves values
  back into the file.
- **Versions** — every write is a new immutable version in Storage; the file
  menu lists versions to preview or restore.
- **Model gateway** (`lib/gateway.ts`) — streaming client with a model
  registry, an idle (not total) timeout so long files can finish, and a
  one-shot fallback to a second provider.
- **Time limits** — a turn that nears the function's time budget pauses and
  the client resumes it automatically in a fresh invocation.

## Setup

```bash
cp .env.example .env.local
# fill in SUPABASE_SERVICE_ROLE_KEY, NVIDIA_API_KEY / DEEPSEEK_API_KEY,
# TAVILY_API_KEY, and optionally GITHUB_TOKEN / GITHUB_OWNER
npm install
npm run dev
```

Migrations live in `supabase/migrations/` (the Supabase project is
`demonic-search`, `gsoiexqtaiyjepzqyfso`).

## Not implemented yet

PPTX export, design-system extraction from uploaded brand files, image
attachments (attachments are text files), and a local-folder codebase option.
