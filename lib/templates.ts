/**
 * A template is only a starting hint: it picks the placeholder on Home and
 * adds a short brief to the agent's instructions. Every project gets the
 * same workspace and the same agent; nothing downstream branches on it.
 */
export type Template = {
  id: string;
  label: string;
  placeholder: string;
  brief: string;
};

export const TEMPLATES: Template[] = [
  {
    id: "blank",
    label: "Blank",
    placeholder: "Describe what you want to create…",
    brief: "No fixed format. Decide the most fitting form for the request.",
  },
  {
    id: "mobile",
    label: "Mobile app design",
    placeholder: "Describe an app idea",
    brief:
      "Mobile app screens. Lay out 3–5 key screens side by side as 390×844 phone frames (rounded corners, status bar, home indicator) on a quiet neutral canvas, each with a small caption above it. Real, specific content, never lorem ipsum. Make primary interactions work (tabs, toggles, navigation between screens) with a little vanilla JS where it's cheap.",
  },
  {
    id: "slides",
    label: "Slides",
    placeholder: "Make a pitch deck about…",
    brief:
      'A slide deck. Each slide is a 1920×1080 <section class="slide">, stacked vertically with a gap and scaled with CSS to fit the viewport width. Include print CSS (@page { size: 1920px 1080px; margin: 0 } and a page break after each slide) so it exports as one slide per page. Arrow keys scroll to the next/previous slide. One idea per slide, big type, strong hierarchy; speaker notes go in a data-notes attribute.',
  },
  {
    id: "document",
    label: "Document",
    placeholder: "Write a one-pager about…",
    brief:
      'A printable document. Use US Letter pages (<div class="page"> at 8.5in × 11in with real margins) shown as paper sheets with a soft shadow on a neutral background, plus @page rules so each .page prints as one sheet. Editorial typography: a clear type scale, measured line length, running header/footer where it helps.',
  },
  {
    id: "wireframe",
    label: "Wireframe",
    placeholder: "Wireframe the flow for…",
    brief:
      "Low-fidelity wireframes: grayscale boxes, real labels and copy, simple annotations explaining intent. Show several screens of the flow side by side with arrows or numbered steps between them. No decorative color or imagery.",
  },
  {
    id: "animation",
    label: "Animation",
    placeholder: "Animate a logo reveal",
    brief:
      "An animation that plays on load, built with CSS keyframes, the Web Animations API, canvas or SVG. Include a small replay control. Expose speed/duration and key colors as tweaks so they can be adjusted live.",
  },
  {
    id: "ui",
    label: "UI mockups",
    placeholder: "Design the dashboard for…",
    brief:
      "High-fidelity desktop UI mockups (1440px wide screens) with realistic data. Show the key screens stacked with a label above each, or one interactive prototype with a startScreen tweak that switches between them. Real component states: hover, selected, empty, loading where relevant.",
  },
  {
    id: "resume",
    label: "Résumé",
    placeholder: "Create a résumé for…",
    brief:
      "A one-page résumé on a US Letter sheet, printable (@page rules), with clean semantic structure (name, contact, summary, experience, skills, education). Refined typography, restrained accent color, no photos or skill bars.",
  },
  {
    id: "3d",
    label: "3D object",
    placeholder: "Model a 3D object of…",
    brief:
      'A 3D scene with three.js loaded as an ES module via an import map from https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js (addons from .../examples/jsm/). Orbit controls, good lighting and materials, full-viewport canvas that resizes. Expose color, rotation speed and similar as tweaks.',
  },
  {
    id: "landing",
    label: "Landing page",
    placeholder: "Design a landing page for…",
    brief:
      "A marketing landing page at a 1440px design width that stays responsive: a hero with a sharp value proposition and primary CTA, social proof, features or how it works, pricing or a comparison where it fits, FAQ and footer. Real, specific copy.",
  },
  {
    id: "designsystem",
    label: "Design system",
    placeholder: "Create a design system for…",
    brief:
      "A design system. If a codebase is connected, extract its real tokens and components from the CSS / Tailwind / theme files instead of inventing them. Make one spec file: color palette with roles and hex values, a type scale using a Google Fonts pairing, spacing and radius scales, and core components (buttons, inputs, cards, navigation, badges) in their states. Then call save_design_system with 5–8 named colors (Background, Surface, Text, Accent, …) and the fonts so it can be picked for future projects.",
  },
  {
    id: "research",
    label: "Research",
    placeholder: "Research and summarize…",
    brief:
      "A cited research report. Use web_search and web_fetch to gather real facts first. Every factual sentence ends with its source ID in brackets like [S3] or [S3, S5]; a numbered sources list is appended automatically, so don't write one. Lead with the answer, then the evidence; use tables or charts only where there are real numbers.",
  },
  {
    id: "email",
    label: "HTML email",
    placeholder: "Design an email announcing…",
    brief:
      "An HTML email: 600px wide, table-based layout with inline styles, bulletproof buttons and web-safe font fallbacks, so it survives real email clients. Show it centered on a light gray backdrop.",
  },
  {
    id: "palette",
    label: "Color + type pairing",
    placeholder: "Explore colors and type for…",
    brief:
      "A color and type exploration: 3–4 distinct directions, each a specimen card with a Google Fonts pairing (headline + body), a palette with named swatches and hex values, and a small UI sample (button, card, heading) using it.",
  },
];

export function getTemplate(id: string | null | undefined): Template {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}
