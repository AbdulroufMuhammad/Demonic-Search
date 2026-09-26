import type { Page } from "playwright-core";

export const SLIDES = ".slide, [data-slide]";
const SLIDE_W_IN = 13.333;

type Run = { text: string; font: string; size: number; color: string; alpha: number; bold: boolean; italic: boolean; underline: boolean; br?: boolean };
type Block = { x: number; y: number; w: number; h: number; align: string; lineHeight: number; letterSpacing: number; bullet: string | null; start: number; lines: number; runs: Run[] };
type SlideData = { width: number; height: number; notes: string; blocks: Block[] };

/**
 * Runs in the page for one slide: shows only that slide, collects every block
 * of plain text (position, size and styling of each run), then makes that text
 * transparent so the screenshot taken next is the slide without its text.
 * Text that can't be reproduced as a text box (inside SVG, rotated, gradient
 * fills, icon fonts) is left alone and stays in the image.
 * Plain JS in a string: bundlers inject helpers that don't exist in the page.
 */
const PREPARE_SLIDE = String.raw`(function (sel, index) {
  var all = Array.prototype.slice.call(document.querySelectorAll(sel));
  var slide = all[index];
  all.forEach(function (el, j) { if (j !== index) el.style.setProperty("visibility", "hidden", "important"); });
  slide.style.setProperty("visibility", "visible", "important");
  slide.style.setProperty("opacity", "1", "important");
  if (getComputedStyle(slide).display === "none") slide.style.setProperty("display", "block", "important");
  slide.scrollIntoView({ block: "start" });
  var sr = slide.getBoundingClientRect();
  var scale = sr.width / (slide.offsetWidth || sr.width);
  var pt = 960 / sr.width;
  var INLINE = /^(inline|contents)$/;
  var SKIP_TAGS = /^(SVG|IMG|CANVAS|VIDEO|IFRAME|INPUT|TEXTAREA|SELECT|PICTURE|OBJECT|SCRIPT|STYLE|TEMPLATE)$/i;

  function parse(c) { return (String(c).match(/[\d.]+/g) || []).map(Number); }
  function hex(c) { var v = parse(c); return v.slice(0, 3).map(function (x) { return Math.round(x).toString(16).padStart(2, "0"); }).join(""); }
  function alpha(c) { var v = parse(c); return v.length > 3 ? v[3] : 1; }
  // The first named font in the stack; system aliases mean nothing to PowerPoint.
  function firstFont(f) {
    var names = String(f).split(",").map(function (x) { return x.replace(/["']/g, "").trim(); });
    var named = names.filter(function (x) { return x && !/^(-apple-system|BlinkMacSystemFont|system-ui|ui-\w+|sans-serif|serif|monospace|cursive|fantasy|emoji|math|inherit)$/i.test(x); })[0];
    return named || (names.some(function (x) { return /^(serif|ui-serif)$/i.test(x); }) ? "Georgia" : names.some(function (x) { return /mono/i.test(x); }) ? "Courier New" : "Arial");
  }
  function rotated(el) {
    for (var a = el; a && a !== slide; a = a.parentElement) {
      var t = getComputedStyle(a).transform;
      if (t && t !== "none") { var m = parse(t); if (m.length >= 4 && (Math.abs(m[1]) > 0.01 || Math.abs(m[2]) > 0.01)) return true; }
    }
    return false;
  }
  // Gradient-filled text can't be a plain text box; the whole block stays in the image so it still looks right.
  function gradientText(el) {
    return [el].concat(Array.prototype.slice.call(el.getElementsByTagName("*"))).some(function (e) {
      var cs = getComputedStyle(e);
      return /text/.test(cs.backgroundClip + " " + cs.webkitBackgroundClip);
    });
  }
  function isTextBlock(el) {
    if (!(el.textContent || "").trim()) return false;
    var kids = el.getElementsByTagName("*");
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (SKIP_TAGS.test(k.tagName)) return false;
      if (k.tagName === "BR") continue;
      if (!INLINE.test(getComputedStyle(k).display)) return false;
    }
    return true;
  }
  function transform(text, cs) {
    if (cs.textTransform === "uppercase") return text.toUpperCase();
    if (cs.textTransform === "lowercase") return text.toLowerCase();
    if (cs.textTransform === "capitalize") return text.replace(/(^|\s)(\S)/g, function (m, a, b) { return a + b.toUpperCase(); });
    return text;
  }
  function runsOf(block) {
    var runs = [];
    var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    var n;
    while ((n = walker.nextNode())) {
      if (n.nodeType === 1) { if (n.tagName === "BR") runs.push({ text: "", br: true }); continue; }
      var p = n.parentElement, cs = getComputedStyle(p);
      var pre = /^pre/.test(cs.whiteSpace);
      var text = pre ? n.textContent : n.textContent.replace(/\s+/g, " ");
      if (!text) continue;
      runs.push({
        text: transform(text, cs),
        font: firstFont(cs.fontFamily),
        size: Math.round(parseFloat(cs.fontSize) * scale * pt * 10) / 10,
        color: hex(cs.color),
        alpha: alpha(cs.color) * Number(cs.opacity || 1),
        bold: Number(cs.fontWeight) >= 600 || cs.fontWeight === "bold",
        italic: cs.fontStyle === "italic",
        underline: /underline/.test(cs.textDecorationLine || cs.textDecoration || ""),
      });
    }
    // Collapse the whitespace HTML would drop at the edges of the block and around line breaks.
    for (var i = 0; i < runs.length; i++) {
      var prev = runs[i - 1], r = runs[i];
      if (r.br) continue;
      if (!prev || prev.br || /\s$/.test(prev.text)) r.text = r.text.replace(/^\s+/, "");
    }
    for (var j = runs.length - 1; j >= 0 && (runs[j].br || !runs[j].text.trim()); j--) runs[j].text = runs[j].text.replace(/\s+$/, "");
    if (runs.length) runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\s+$/, "");
    return runs.filter(function (r) { return r.br || r.text; });
  }

  var blocks = [], hide = [];
  (function visit(el) {
    for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
      if (SKIP_TAGS.test(c.tagName) || c.matches("aside.notes, .notes")) continue;
      var cs = getComputedStyle(c);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      if (!isTextBlock(c)) { visit(c); continue; }
      var r = c.getBoundingClientRect();
      if (!r.width || !r.height || r.right < sr.left || r.left > sr.right || r.bottom < sr.top || r.top > sr.bottom) continue;
      if (Number(cs.opacity) < 0.05 || /vertical/.test(cs.writingMode) || /icon|symbol/i.test(cs.fontFamily) || rotated(c) || gradientText(c)) continue;
      var runs = runsOf(c);
      // Symbol-only text (icon glyphs, arrows, emoji) stays in the image, where it looks right.
      if (!/[\p{L}\p{N}]/u.test(runs.map(function (x) { return x.text || ""; }).join(""))) continue;
      var padL = (parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth)) * scale, padR = (parseFloat(cs.paddingRight) + parseFloat(cs.borderRightWidth)) * scale;
      var padT = (parseFloat(cs.paddingTop) + parseFloat(cs.borderTopWidth)) * scale, padB = (parseFloat(cs.paddingBottom) + parseFloat(cs.borderBottomWidth)) * scale;
      var fs = parseFloat(cs.fontSize) * scale;
      var lh = cs.lineHeight === "normal" ? fs * 1.2 : parseFloat(cs.lineHeight) * scale;
      var h = r.height - padT - padB;
      var list = cs.display === "list-item" && cs.listStyleType !== "none" ? (/decimal|alpha|roman/.test(cs.listStyleType) ? "number" : "bullet") : null;
      blocks.push({
        x: r.left - sr.left + padL, y: r.top - sr.top + padT, w: r.width - padL - padR, h: h,
        align: cs.textAlign === "center" ? "center" : cs.textAlign === "right" || cs.textAlign === "end" ? "right" : cs.textAlign === "justify" ? "justify" : "left",
        lineHeight: Math.round(lh * pt * 10) / 10,
        letterSpacing: cs.letterSpacing === "normal" ? 0 : Math.round(parseFloat(cs.letterSpacing) * scale * pt * 10) / 10,
        bullet: list,
        start: list === "number" && c.parentElement ? (Number(c.parentElement.getAttribute("start")) || 1) + Array.prototype.filter.call(c.parentElement.children, function (x) { return x.tagName === "LI"; }).indexOf(c) : 1,
        lines: Math.max(1, Math.round(h / lh)),
        runs: runs,
      });
      hide.push(c);
    }
  })(slide);

  hide.forEach(function (el) {
    [el].concat(Array.prototype.slice.call(el.getElementsByTagName("*"))).forEach(function (e) {
      e.style.setProperty("color", "transparent", "important");
      e.style.setProperty("-webkit-text-fill-color", "transparent", "important");
      e.style.setProperty("text-shadow", "none", "important");
      e.style.setProperty("text-decoration-color", "transparent", "important");
    });
  });
  var notesEl = slide.querySelector("aside.notes, .notes");
  return { width: sr.width, height: sr.height, notes: (slide.getAttribute("data-notes") || (notesEl ? notesEl.innerText : "") || "").trim(), blocks: blocks };
})`;

/**
 * Build a .pptx from a slide deck. "editable" (the default) gives each slide
 * its design as a background image plus real, editable text boxes on top;
 * "image" makes each slide a single picture that matches the design exactly.
 */
export async function buildPptx(page: Page, title: string, mode: "editable" | "image" = "editable"): Promise<Buffer | null> {
  const slides = page.locator(SLIDES);
  const count = Math.min(await slides.count(), 80);
  if (!count) return null;
  // Decks often scale themselves to fit the window; undo that so every slide is captured at full resolution.
  await page.evaluate(`document.querySelectorAll(${JSON.stringify(SLIDES)}).forEach((el) => {
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) a.style.setProperty("transform", "none", "important");
  })`);

  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.title = title;
  let heightIn = 7.5;
  for (let i = 0; i < count; i++) {
    const el = slides.nth(i);
    const data = (await page.evaluate(`${PREPARE_SLIDE}(${JSON.stringify(SLIDES)}, ${i})`)) as SlideData;
    if (i === 0) {
      // Match the deck's aspect ratio (16:9 decks get PowerPoint's widescreen layout).
      heightIn = Math.round(((SLIDE_W_IN * data.height) / data.width) * 1000) / 1000;
      pptx.defineLayout({ name: "DECK", width: SLIDE_W_IN, height: heightIn });
      pptx.layout = "DECK";
    }
    if (mode === "image") {
      await page.evaluate(`document.querySelectorAll(${JSON.stringify(SLIDES)})[${i}].querySelectorAll("*").forEach((e) => { e.style.removeProperty("color"); e.style.removeProperty("-webkit-text-fill-color"); e.style.removeProperty("text-shadow"); e.style.removeProperty("text-decoration-color"); })`);
      data.blocks = [];
    }
    await page.waitForTimeout(50);
    const shot = await el.screenshot({ type: "png" });
    const slide = pptx.addSlide();
    slide.addImage({ data: `image/png;base64,${shot.toString("base64")}`, x: 0, y: 0, w: SLIDE_W_IN, h: heightIn });
    const inch = SLIDE_W_IN / data.width;
    for (const b of data.blocks) {
      // PowerPoint's font metrics differ a little from the browser's: give boxes some slack so lines don't re-wrap.
      const singleLine = b.lines <= 1;
      const extra = b.w * (singleLine ? 0.15 : 0.04);
      const x = b.align === "center" ? b.x - extra / 2 : b.align === "right" ? b.x - extra : b.x;
      // A <br> ends the run before it; only a second <br> in a row adds an empty line.
      const runs: Run[] = [];
      for (const r of b.runs) {
        const prev = runs[runs.length - 1];
        if (r.br && prev && !prev.br) prev.br = true;
        else runs.push(r.br ? { ...(prev ?? b.runs.find((x) => !x.br) ?? r), text: "", br: true } : { ...r });
      }
      const indentPt = b.bullet ? Math.round((runs[0]?.size ?? 18) * 1.2) : 0;
      slide.addText(
        runs.map((r) => ({
          text: r.text,
          options: {
            fontFace: r.font,
            fontSize: r.size,
            color: r.color,
            transparency: Math.round((1 - Math.min(1, r.alpha)) * 100),
            bold: r.bold,
            italic: r.italic,
            underline: r.underline ? { style: "sng" as const } : undefined,
            breakLine: r.br || undefined,
          },
        })),
        {
          // PowerPoint puts the bullet inside the box, where the browser draws it outside the text.
          x: Math.max(0, x * inch - indentPt / 72),
          y: b.y * inch,
          w: (b.w + extra) * inch + indentPt / 72,
          h: Math.max(b.h * inch, 0.2),
          margin: 0,
          valign: "top",
          align: b.align as "left" | "center" | "right" | "justify",
          lineSpacing: b.lineHeight || undefined,
          charSpacing: b.letterSpacing || undefined,
          bullet: b.bullet === "number" ? { type: "number", numberStartAt: b.start, indent: indentPt } : b.bullet ? { indent: indentPt } : undefined,
          wrap: !singleLine,
          fit: "none",
        }
      );
    }
    if (data.notes) slide.addNotes(data.notes);
  }
  return (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
}
