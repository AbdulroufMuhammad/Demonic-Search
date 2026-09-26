import type { DSColor, DSFont } from "@/lib/designSystems";

/**
 * Read a design system's tokens straight out of its spec file: colors from
 * the CSS custom properties, fonts from font-family properties or the Google
 * Fonts link. Used when the agent made a design system but didn't save it
 * itself, so the result still lands in the design system picker.
 */
export function extractDesignSystem(html: string, fallbackName: string): { name: string; colors: DSColor[]; fonts: DSFont[] } | null {
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
  const vars = new Map<string, string>();
  for (const m of css.matchAll(/--([\w-]+)\s*:\s*([^;{}]+)/g)) {
    if (!vars.has(m[1])) vars.set(m[1], m[2].trim());
  }

  const colors: DSColor[] = [];
  const seen = new Set<string>();
  for (const [key, value] of vars) {
    const hex = toHex(value);
    if (!hex || seen.has(hex)) continue;
    seen.add(hex);
    colors.push({ name: humanize(key.replace(/^(color|colour|clr|c)-/i, "")), hex });
    if (colors.length === 12) break;
  }
  if (colors.length < 2) {
    // No color variables: fall back to the most used hex colors in the styles.
    const counts = new Map<string, number>();
    for (const m of css.matchAll(/#[0-9a-f]{3,8}\b/gi)) {
      const hex = toHex(m[0]);
      if (hex) counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }
    colors.length = 0;
    [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([hex], i) => colors.push({ name: `Color ${i + 1}`, hex }));
  }
  if (colors.length < 2) return null;

  const fonts: DSFont[] = [];
  const addFont = (role: string, stack: string) => {
    stack = stack.replace(/"/g, "'").replace(/\s+/g, " ").trim().slice(0, 120);
    if (!stack || /^var\(/.test(stack) || fonts.some((f) => f.role === role || f.stack === stack)) return;
    fonts.push({ role, stack });
  };
  for (const [key, value] of vars) {
    if (/font|family|^ff-/i.test(key) && /[a-z]/i.test(value) && !/^\d/.test(value) && !/(size|weight|leading|tracking)/i.test(key)) addFont(fontRole(key, value), value);
  }
  if (!fonts.length) {
    const link = html.match(/fonts\.googleapis\.com\/css2?\?([^"'\s>]+)/i)?.[1] ?? "";
    for (const m of link.matchAll(/family=([^:&]+)/g)) {
      const family = decodeURIComponent(m[1].replace(/\+/g, " "));
      const generic = /mono|code/i.test(family) ? "monospace" : /serif|garamond|playfair|lora|fraunces/i.test(family) && !/sans/i.test(family) ? "serif" : "sans-serif";
      addFont(generic === "monospace" ? "Mono" : fonts.length ? "Body" : "Heading", `'${family}', ${generic}`);
    }
  }
  if (!fonts.length) {
    for (const m of css.matchAll(/font-family\s*:\s*([^;{}]+)/gi)) addFont(fonts.length ? "Body" : "Heading", m[1]);
  }
  if (!fonts.length) return null;
  fonts.splice(4);

  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "";
  const name =
    title
      .split(/\s[-–—|:·]\s|,\s/)[0]
      .replace(/\bdesign system\b/i, "")
      .trim() ||
    fallbackName.replace(/\bdesign system\b/i, "").replace(/^(create|make|build)\s+(a|an)\s+(for\s+)?/i, "").trim() ||
    "Untitled system";
  return { name: name.slice(0, 60), colors, fonts };
}

function toHex(value: string): string | null {
  const m = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (!m) return null;
  const h = m[1].toLowerCase();
  return "#" + (h.length === 3 ? [...h].map((c) => c + c).join("") : h.slice(0, 6));
}

function humanize(key: string) {
  const words = key.replace(/[-_]+/g, " ").trim();
  return (words.charAt(0).toUpperCase() + words.slice(1)).slice(0, 40) || "Color";
}

function fontRole(key: string, value: string) {
  if (/mono|code/i.test(key) || /monospace/i.test(value)) return "Mono";
  if (/display|head|title|serif(?!-)/i.test(key)) return "Heading";
  if (/body|text|base|sans|ui/i.test(key)) return "Body";
  return humanize(key.replace(/^(font|ff)-?/i, "")) || "Body";
}
