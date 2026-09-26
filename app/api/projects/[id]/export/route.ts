import { getProject, notFoundResponse } from "@/lib/access";
import { readFile } from "@/lib/projectData";
import { launchBrowser, openDesign } from "@/lib/tools/browser";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SLIDES = ".slide, [data-slide]";

function attachment(name: string, ext: string) {
  const base = name.replace(/\.html$/i, "").replace(/["\\\r\n]/g, "") || "design";
  return `attachment; filename="${base}.${ext}"; filename*=UTF-8''${encodeURIComponent(`${base}.${ext}`)}`;
}

/**
 * Downloads: standalone HTML; PNG (full-page render); PPTX for slide decks,
 * one full-bleed image per slide with its speaker notes. PDF export happens
 * in the browser's print dialog instead (lib/print.ts).
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const res = await getProject(params.id);
  if (!res.ok) return notFoundResponse();
  const sp = new URL(req.url).searchParams;
  const format = sp.get("format") ?? "html";
  const file = await readFile(res.admin, params.id, sp.get("path") ?? "");
  if (!file) return Response.json({ error: "file not found" }, { status: 404 });

  if (format === "html") {
    return new Response(file.content, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": attachment(file.path, "html") },
    });
  }
  if (format !== "png" && format !== "pptx") return Response.json({ error: "format must be html, png or pptx" }, { status: 400 });

  const browser = await launchBrowser();
  try {
    if (format === "png") {
      const page = await openDesign(browser, file.content, { width: 1440, height: 900 });
      const height = Math.min(16_000, (await page.evaluate("document.documentElement.scrollHeight")) as number);
      const png = await page.screenshot({ type: "png", fullPage: true, clip: { x: 0, y: 0, width: 1440, height } });
      return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Content-Disposition": attachment(file.path, "png") } });
    }

    const page = await openDesign(browser, file.content, { width: 1920, height: 1080 });
    const slides = page.locator(SLIDES);
    const count = Math.min(await slides.count(), 80);
    if (!count) return Response.json({ error: "No slides found. PPTX export works for slide decks (elements with class “slide”)." }, { status: 400 });

    // Decks often scale themselves to fit the window; undo that so every slide is captured at full resolution.
    await page.evaluate(`document.querySelectorAll(${JSON.stringify(SLIDES)}).forEach((el) => {
      for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) a.style.setProperty("transform", "none", "important");
    })`);
    const PptxGenJS = (await import("pptxgenjs")).default;
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    pptx.title = file.path.replace(/\.html$/i, "");
    for (let i = 0; i < count; i++) {
      const el = slides.nth(i);
      const shot = await el.screenshot({ type: "png" });
      const notes = ((await el.getAttribute("data-notes")) ?? (await el.locator("aside.notes, .notes").first().innerText().catch(() => "")) ?? "").trim();
      const slide = pptx.addSlide();
      slide.addImage({ data: `image/png;base64,${shot.toString("base64")}`, x: 0, y: 0, w: 13.333, h: 7.5 });
      if (notes) slide.addNotes(notes);
    }
    const buf = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": attachment(file.path, "pptx"),
      },
    });
  } finally {
    await browser.close().catch(() => {});
  }
}
