const API = "https://api.github.com";

function headers() {
  const h: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "demonic-search" };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

async function gh(path: string) {
  const res = await fetch(API + path, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`github ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

export const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

export type RepoSummary = { full_name: string; description: string | null; private: boolean };

/** Repos to offer in the codebase picker: the token's own repos if one is set, otherwise GITHUB_OWNER's public ones. */
export async function listRepos(): Promise<RepoSummary[]> {
  const owner = process.env.GITHUB_OWNER;
  const path = process.env.GITHUB_TOKEN
    ? "/user/repos?per_page=100&sort=pushed"
    : owner
      ? `/users/${encodeURIComponent(owner)}/repos?per_page=100&sort=pushed`
      : null;
  if (!path) return [];
  const data = await gh(path);
  return (data as any[]).map((r) => ({ full_name: r.full_name, description: r.description, private: r.private }));
}

const TEXT_EXT = /\.(tsx?|jsx?|mjs|cjs|css|scss|sass|less|html?|vue|svelte|astro|json|md|mdx|ya?ml|toml|svg|txt)$/i;
const SKIP_DIR = /(^|\/)(node_modules|\.git|dist|build|\.next|out|coverage|vendor|__pycache__)(\/|$)/;

/** Read-only access to one GitHub repo for the agent; the tree is fetched once per turn. */
export function makeRepoTools(repo: string) {
  let tree: string[] | null = null;

  async function loadTree() {
    if (tree) return tree;
    const meta = await gh(`/repos/${repo}`);
    const t = await gh(`/repos/${repo}/git/trees/${encodeURIComponent(meta.default_branch)}?recursive=1`);
    tree = (t.tree as any[])
      .filter((n) => n.type === "blob" && TEXT_EXT.test(n.path) && !SKIP_DIR.test(n.path))
      .map((n) => n.path as string);
    return tree;
  }

  return {
    async repo_tree({ path = "" }: { path?: string }) {
      const prefix = String(path).replace(/^\/+|\/+$/g, "");
      const all = await loadTree();
      const hits = prefix ? all.filter((p) => p === prefix || p.startsWith(prefix + "/")) : all;
      return { repo, files: hits.slice(0, 400), truncated: hits.length > 400 };
    },
    async repo_read({ path }: { path: string }) {
      const clean = String(path).replace(/^\/+/, "");
      if (clean.split("/").some((seg) => !seg || seg === "." || seg === "..")) throw new Error("invalid path");
      const data = await gh(`/repos/${repo}/contents/${clean.split("/").map(encodeURIComponent).join("/")}`);
      if (Array.isArray(data) || data.type !== "file") throw new Error("not a file");
      const text = Buffer.from(data.content ?? "", "base64").toString("utf8");
      return { path: clean, content: text.slice(0, 30000), truncated: text.length > 30000 };
    },
  };
}

export const REPO_TOOL_SCHEMAS = [
  {
    type: "function" as const,
    function: {
      name: "repo_tree",
      description: "List source files in the connected codebase, optionally under a folder path.",
      parameters: { type: "object", properties: { path: { type: "string" } } },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "repo_read",
      description: "Read one file from the connected codebase.",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    },
  },
];
