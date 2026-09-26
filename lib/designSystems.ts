export type DSColor = { name: string; hex: string };
export type DSFont = { role: string; stack: string };
export type DesignSystem = {
  id: string;
  name: string;
  colors: DSColor[];
  fonts: DSFont[];
  updated_at?: string;
  /** true for the seeded starter systems (owner_id is null). */
  builtin?: boolean;
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

/** A design system phrased as instructions for the design agent. */
export function describeForAgent(ds: DesignSystem | null) {
  if (!ds) return "";
  return `Design system "${ds.name}": use these tokens as the palette and type (define them as CSS custom properties). Colors: ${ds.colors
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
