export type StoredAttachment = { name: string; kind: "text" | "image" | "folder"; content?: string; url?: string; description?: string };

const MAX_TEXT = 200_000;
const MAX_FOLDER = 320_000;

/** Images must be ones uploaded through /api/uploads, so the agent never fetches arbitrary URLs. */
function isOwnUpload(url: string) {
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/artifacts/uploads/`;
  return url.startsWith(base) && !url.slice(base.length).includes("/");
}

export function cleanAttachments(list: unknown): StoredAttachment[] {
  if (!Array.isArray(list)) return [];
  const out: StoredAttachment[] = [];
  for (const a of list.slice(0, 6)) {
    if (!a || typeof a.name !== "string") continue;
    const name = a.name.slice(0, 120);
    if (a.kind === "image") {
      if (typeof a.url === "string" && isOwnUpload(a.url)) out.push({ kind: "image", name, url: a.url });
    } else if (typeof a.content === "string") {
      const kind = a.kind === "folder" ? "folder" : "text";
      out.push({ kind, name, content: a.content.slice(0, kind === "folder" ? MAX_FOLDER : MAX_TEXT) });
    }
  }
  return out;
}
