import { chat, type ModelKey } from "@/lib/gateway";

const VISION_MODELS: ModelKey[] = ["omni", "muse"];

const DESCRIBE_PROMPT = `Describe this image for a designer who can't see it but has to build from it. Cover, as applicable:
- What it is (a screenshot of an app/site, a logo, a photo, a sketch, a moodboard…).
- Layout and structure, top to bottom: sections, components, navigation, grid.
- Colors, with approximate hex values for the main ones.
- Typography: style (serif/sans/mono), weights, relative sizes; name the typeface if it's recognisable.
- All visible text, verbatim where legible.
- Distinctive visual details: corner radius, shadows, borders, illustration or photo style, iconography.
Be specific and factual. Plain text, no preamble.`;

async function toDataUrl(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`couldn't load the image (${res.status})`);
  const type = res.headers.get("content-type")?.split(";")[0] || "image/png";
  return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
}

/** Have a vision model (Nemotron Omni, then Muse Glimmer) describe an attached image for the text-only design model. */
export async function describeImage(url: string, opts: { deadline: number; signal?: AbortSignal }): Promise<string> {
  const dataUrl = await toDataUrl(url);
  let lastError: unknown = new Error("no vision model available");
  for (const model of VISION_MODELS) {
    if (opts.deadline - Date.now() < 10_000) break;
    try {
      const r = await chat(model, {
        messages: [{ role: "user", content: [{ type: "text", text: DESCRIBE_PROMPT }, { type: "image_url", image_url: { url: dataUrl } }] }],
        deadline: Math.min(opts.deadline, Date.now() + 75_000),
        signal: opts.signal,
        noFallback: true,
      });
      const text = (r.content.trim() || r.reasoning.trim()).slice(0, 4000);
      if (text) return text;
    } catch (e) {
      lastError = e;
      if (opts.signal?.aborted) break;
    }
  }
  throw lastError;
}
