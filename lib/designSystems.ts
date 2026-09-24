export type DSColor = { name: string; hex: string };
export type DSFont = { role: string; stack: string };
export type DesignSystem = {
  id: string;
  name: string;
  colors: DSColor[];
  fonts: DSFont[];
  updated_at?: string;
  /** true for the virtual "no system" placeholder and for the seeded global systems (owner_id is null). */
  builtin?: boolean;
};

/**
 * The house style, used when a project has no design_system_id. Unlike the
 * seeded systems below, this one is never a stored row — picking it in the
 * composer just means design_system_id = null.
 */
export const DEFAULT_DS: DesignSystem = {
  id: "default",
  name: "Demonic Default",
  builtin: true,
  colors: [
    { name: "Background", hex: "#0d0e0c" },
    { name: "Surface", hex: "#1c1d1a" },
    { name: "Text", hex: "#f1f0ea" },
    { name: "Paper", hex: "#f6f4ee" },
    { name: "Accent", hex: "#c8f542" },
  ],
  fonts: [
    { role: "Heading", stack: "'Source Serif 4', serif" },
    { role: "Body", stack: "'Source Serif 4', serif" },
  ],
};

export function fromRow(row: {
  id: string;
  name: string;
  tokens: any;
  owner_id?: string | null;
  updated_at?: string;
  created_at?: string;
}): DesignSystem {
  const t = row.tokens ?? {};
  return {
    id: row.id,
    name: row.name,
    colors: Array.isArray(t.colors) ? t.colors : [],
    fonts: Array.isArray(t.fonts) ? t.fonts : [],
    updated_at: row.updated_at ?? row.created_at,
    builtin: row.owner_id === null,
  };
}

function rgb(hex: string) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const lum = (hex: string) => {
  const [r, g, b] = rgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const sat = (hex: string) => {
  const [r, g, b] = rgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
};
const byName = (ds: DesignSystem, ...names: string[]) => {
  for (const n of names) {
    const c = ds.colors.find((c) => c.name.toLowerCase() === n);
    if (c) return c.hex;
  }
  return undefined;
};

/**
 * Map a design system's tokens onto the report's CSS variables. Named roles
 * (Background/Text/Accent, as the seeded systems use) are matched directly;
 * anything else falls back to picking by lightness/saturation so an
 * arbitrary user-supplied palette still produces a readable paper.
 */
export function reportVars(ds: DesignSystem | null): Record<string, string> {
  if (!ds || !ds.colors.length) return {};
  const vars: Record<string, string> = {};
  const bg = byName(ds, "background", "paper");
  const text = byName(ds, "text", "ink");
  const accent = byName(ds, "accent");
  if (bg) vars["--paper"] = bg;
  if (text) vars["--ink"] = text;
  if (accent) vars["--accent"] = accent;
  if (!bg || !text || !accent) {
    const byLum = [...ds.colors].sort((a, b) => lum(a.hex) - lum(b.hex));
    vars["--paper"] ??= byLum[byLum.length - 1].hex;
    vars["--ink"] ??= byLum[0].hex;
    vars["--accent"] ??= [...ds.colors].sort((a, b) => sat(b.hex) - sat(a.hex))[0].hex;
  }
  if (ds.fonts[0]) vars["--font-heading"] = ds.fonts[0].stack;
  const body = ds.fonts[1] ?? ds.fonts[0];
  if (body) vars["--font-text"] = body.stack;
  return vars;
}

export function describeForWriter(ds: DesignSystem | null) {
  if (!ds) return "";
  return `Apply the "${ds.name}" design system. Colors: ${ds.colors
    .map((c) => `${c.name} ${c.hex}`)
    .join(", ")}. Fonts: ${ds.fonts.map((f) => `${f.role}: ${f.stack}`).join("; ")}.`;
}

// Known weight sets for the fonts the seeded systems use, so the Google
// Fonts request only asks for cuts that exist. Anything not listed falls
// back to a common 400/500/600/700 set (extra weights a variable font
// doesn't have are just ignored by the API).
const FONT_WEIGHTS: Record<string, string> = {
  Inter: "400;500;600;700",
  Figtree: "400;600;700",
  Caprasimo: "400",
  Archivo: "400;600;800",
  "Cormorant Garamond": "400;600",
  Lora: "400;600",
};

/** A Google Fonts stylesheet URL for every distinct family the system's fonts name, or null if none. */
export function googleFontsHref(ds: DesignSystem | null): string | null {
  if (!ds) return null;
  const families = new Map<string, string>();
  for (const f of ds.fonts) {
    const name = (f.stack.match(/'([^']+)'/)?.[1] ?? f.stack.split(",")[0]).trim();
    if (!name || families.has(name) || /^(serif|sans-serif|monospace|system-ui)$/i.test(name)) continue;
    families.set(name, FONT_WEIGHTS[name] ?? "400;500;600;700");
  }
  if (!families.size) return null;
  const parts = [...families].map(([name, w]) => `family=${name.replace(/ /g, "+")}:wght@${w}`);
  return `https://fonts.googleapis.com/css2?${parts.join("&")}&display=swap`;
}
