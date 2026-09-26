import type { SupabaseClient } from "@supabase/supabase-js";
import { chat, type ContentPart, type ModelKey } from "@/lib/gateway";
import { BUCKET } from "@/lib/tools/files";
import { launchBrowser, openDesign } from "@/lib/tools/browser";

const WIDTH = 1280;
const TILE = 1100;
const MAX_TILES = 3;
const REVIEWERS: ModelKey[] = ["omni", "muse"];

export type Automated = {
  jsErrors: string[];
  horizontalOverflow: { desktop: number; mobile: number };
  brokenImages: number;
  lowContrast: { text: string; ratio: number; fg: string; bg: string }[];
  clippedText: string[];
  emptyPage: boolean;
  height: number;
};

export type VisualIssue = { where: string; problem: string; severity: "high" | "medium" | "low" };

export type CheckResult = {
  automated: Automated;
  issues: VisualIssue[];
  overall: string;
  reviewer: string | null;
  screenshotUrl: string | null;
};

/**
 * Runs inside the page: cheap, deterministic checks a screenshot can miss.
 * Plain JS in a string on purpose: bundlers inject helpers into compiled
 * functions that don't exist inside the browser page.
 */
const INSPECT_PAGE = String.raw`(() => {
  const parse = (c) => (String(c).match(/[\d.]+/g) || []).map(Number);
  const lum = (rgb) => {
    const v = rgb.slice(0, 3).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const hex = (rgb) => "#" + rgb.slice(0, 3).map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");
  const background = (el) => {
    while (el) {
      const cs = getComputedStyle(el);
      if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
      const c = parse(cs.backgroundColor);
      if (c.length >= 3 && (c.length < 4 || c[3] > 0.6)) return c;
      el = el.parentElement;
    }
    return [255, 255, 255];
  };
  const lowContrast = [], clippedText = [];
  let scanned = 0;
  for (const el of Array.from(document.body.querySelectorAll("*"))) {
    if (scanned > 600) break;
    const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent || "").trim().length > 1);
    if (!own) continue;
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (!rect.width || !rect.height || cs.visibility === "hidden" || Number(cs.opacity) < 0.2) continue;
    scanned++;
    const text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60);
    const bg = background(el), fg = parse(cs.color);
    if (bg && fg.length >= 3 && (fg.length < 4 || fg[3] > 0.6)) {
      const pair = [lum(fg), lum(bg)].sort((x, y) => y - x);
      const ratio = (pair[0] + 0.05) / (pair[1] + 0.05);
      const size = parseFloat(cs.fontSize);
      const large = size >= 24 || (size >= 18.5 && Number(cs.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5)) lowContrast.push({ text, ratio: Math.round(ratio * 100) / 100, fg: hex(fg), bg: hex(bg) });
    }
    const clips = /(hidden|clip)/.test(cs.overflow + cs.overflowX + cs.overflowY) || cs.textOverflow === "ellipsis";
    if (clips && (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 4) && cs.whiteSpace !== "nowrap") clippedText.push(text);
  }
  lowContrast.sort((a, b) => a.ratio - b.ratio);
  return {
    lowContrast: lowContrast.slice(0, 6),
    clippedText: clippedText.slice(0, 6),
    brokenImages: Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0).length,
    emptyPage: (document.body.innerText || "").trim().length < 20 && !document.querySelector("canvas, svg, img"),
    overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
    height: document.documentElement.scrollHeight,
  };
})()`;

type PageReport = {
  lowContrast: Automated["lowContrast"];
  clippedText: string[];
  brokenImages: number;
  emptyPage: boolean;
  overflow: number;
  height: number;
};

const REVIEW_PROMPT = `You are a meticulous UI reviewer. The images are screenshots of one design, rendered at 1280px wide, shown top to bottom.
List concrete visual problems a user would notice: overlapping or clipped text, broken or misaligned layout, content running off the page, unreadable contrast, missing or broken images/icons, awkward large empty areas, inconsistent spacing or type sizes, placeholder or lorem text, anything that looks unfinished or broken. Say where each one is (section/element) and what is wrong. Don't comment on taste or suggest new features.
Reply with ONLY JSON: {"issues":[{"where":"…","problem":"…","severity":"high"|"medium"|"low"}],"overall":"one sentence"}. An empty issues array means it looks right.`;

function parseReview(text: string): { issues: VisualIssue[]; overall: string } | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    const issues = (Array.isArray(j.issues) ? j.issues : [])
      .map((i: any) => ({
        where: String(i.where ?? "").slice(0, 120),
        problem: String(i.problem ?? "").slice(0, 300),
        severity: (["high", "medium", "low"].includes(i.severity) ? i.severity : "medium") as VisualIssue["severity"],
      }))
      .filter((i: VisualIssue) => i.problem)
      .slice(0, 12);
    return { issues, overall: String(j.overall ?? "").slice(0, 300) };
  } catch {
    return null;
  }
}

const RENDER_TIMEOUT_MS = 35_000;
const REVIEW_TIMEOUT_MS = 40_000;

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([p, new Promise<T>((_, reject) => (timer = setTimeout(() => reject(new Error(message)), ms)))]).finally(() => clearTimeout(timer));
}

async function render(html: string): Promise<{ automated: Automated; tiles: Buffer[] }> {
  const browser = await launchBrowser();
  const tiles: Buffer[] = [];
  try {
    const jsErrors: string[] = [];
    const page = await openDesign(browser, html, { width: WIDTH, height: 800 }, (msg) => jsErrors.push(msg));
    const desktop = (await page.evaluate(INSPECT_PAGE)) as PageReport;
    const height = Math.min(desktop.height, TILE * MAX_TILES);
    for (let y = 0; y < height; y += TILE) {
      tiles.push(await page.screenshot({ type: "jpeg", quality: 65, fullPage: true, clip: { x: 0, y, width: WIDTH, height: Math.min(TILE, height - y) } }));
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    const mobile = (await page.evaluate("Math.max(0, document.documentElement.scrollWidth - window.innerWidth)")) as number;
    return {
      tiles,
      automated: {
        jsErrors: [...new Set(jsErrors)].slice(0, 5),
        horizontalOverflow: { desktop: desktop.overflow, mobile },
        brokenImages: desktop.brokenImages,
        lowContrast: desktop.lowContrast,
        clippedText: desktop.clippedText,
        emptyPage: desktop.emptyPage,
        height: desktop.height,
      },
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

/**
 * Render a design in headless Chromium, run automatic checks, and have a
 * vision model (Nemotron Omni, falling back to Muse Glimmer) review
 * screenshots of it. The first screenshot is stored so the chat can show it.
 */
export async function checkDesign(
  db: SupabaseClient,
  projectId: string,
  html: string,
  opts: { deadline: number; signal?: AbortSignal; request?: string }
): Promise<CheckResult> {
  // Rendering is capped: a browser that can't start or a page that never settles must not stall the turn.
  const { automated, tiles } = await withTimeout(render(html), RENDER_TIMEOUT_MS, "the page took too long to render");

  let screenshotUrl: string | null = null;
  if (tiles[0]) {
    const key = `${projectId}/checks/${Date.now()}.jpg`;
    const { error } = await db.storage.from(BUCKET).upload(key, new Blob([new Uint8Array(tiles[0])], { type: "image/jpeg" }), { contentType: "image/jpeg" });
    if (!error) screenshotUrl = db.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
  }

  const content: ContentPart[] = [
    {
      type: "text",
      text:
        (opts.request
          ? `The user asked for: "${opts.request.slice(0, 600)}"\nFirst check that the design actually shows what they asked for. Every subject, object or element they named must be clearly visible and in the right place (for example "a stickman on a tree" needs a visible stickman on the tree). Anything requested that is missing, cut off, off-screen or in the wrong place is a HIGH severity issue; don't assume it's there because a heading says so.\n\n`
          : "") + REVIEW_PROMPT,
    },
    ...tiles.map((t) => ({ type: "image_url" as const, image_url: { url: `data:image/jpeg;base64,${t.toString("base64")}` } })),
  ];
  const reviewUntil = Math.min(opts.deadline - 5_000, Date.now() + REVIEW_TIMEOUT_MS + 5_000);
  for (const model of REVIEWERS) {
    if (reviewUntil - Date.now() < 8_000) break;
    try {
      const r = await chat(model, {
        messages: [{ role: "user", content }],
        deadline: Math.min(opts.deadline - 5_000, Date.now() + REVIEW_TIMEOUT_MS),
        signal: opts.signal,
        noFallback: true,
        // A review needs a short answer, not pages of deliberation; this keeps the reasoning model fast.
        maxTokens: 1500,
        extra: model === "omni" ? { reasoning_budget: 768 } : undefined,
      });
      const review = parseReview(r.content) ?? parseReview(r.reasoning);
      if (review) return { automated, ...review, reviewer: model, screenshotUrl };
    } catch {
      if (opts.signal?.aborted) break;
    }
  }
  return { automated, issues: [], overall: "The visual review model was unavailable; only the automatic checks ran.", reviewer: null, screenshotUrl };
}
