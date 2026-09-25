// Raw HTTP model gateway — no vendor SDK. Both providers serve an
// OpenAI-format /chat/completions endpoint, so one client covers both.
// Model params live in this registry, never in agent code (guide §4/§8).

export type ModelKey = "glm" | "glm-flash" | "muse" | "omni" | "deepseek";

type ModelConfig = {
  id: string;
  provider: "nvidia" | "deepseek";
  temperature: number;
  top_p: number;
  max_tokens: number;
  vision?: boolean;
  extra?: Record<string, unknown>;
};

export const MODELS: Record<ModelKey, ModelConfig> = {
  glm: { id: "z-ai/glm-5.3", provider: "nvidia", temperature: 0.5, top_p: 1, max_tokens: 16384 },
  "glm-flash": {
    id: "z-ai/glm-5.3-flash",
    provider: "nvidia",
    temperature: 0.5,
    top_p: 1,
    max_tokens: 8192,
  },
  muse: {
    id: "meta/muse-glimmer-30b",
    provider: "nvidia",
    temperature: 1,
    top_p: 0.95,
    max_tokens: 8192,
    vision: true,
  },
  omni: {
    id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    provider: "nvidia",
    temperature: 0.6,
    top_p: 0.95,
    max_tokens: 65536,
    extra: { reasoning_budget: 16384 },
    vision: true,
  },
  deepseek: {
    id: "deepseek-chat",
    provider: "deepseek",
    temperature: 0.5,
    top_p: 1,
    max_tokens: 8192,
  },
};

// A model profile maps the five(+) agent roles to a concrete model, so the
// UI can offer "Quality" / "Fast" / "Self-hosted" without touching agent code.
export const MODEL_PROFILES: Record<string, Record<string, ModelKey>> = {
  quality: {
    planner: "glm",
    researcher: "glm-flash",
    critic: "glm",
    writer: "glm",
    verifier: "muse",
    ingest: "omni",
  },
  fast: {
    planner: "glm-flash",
    researcher: "glm-flash",
    critic: "glm-flash",
    writer: "glm-flash",
    verifier: "muse",
    ingest: "omni",
  },
};

export const FALLBACKS: Record<ModelKey, ModelKey> = {
  glm: "deepseek",
  "glm-flash": "deepseek",
  muse: "omni",
  omni: "muse",
  deepseek: "deepseek",
};

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
};

export type ToolSchema = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type ChatResult = {
  content: string;
  reasoning: string;
  toolCalls: { id: string; name: string; args: string }[];
  finish: string | null;
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
};

export class GatewayError extends Error {
  constructor(public status: number, body: string) {
    super(`gateway ${status}: ${body.slice(0, 500)}`);
  }
}

// The cap on a single provider attempt. Kept below the per-role budget a
// caller passes via `deadline` so a hung primary-model call still leaves
// room to try the fallback within the same overall budget, instead of
// eating all of it on one attempt.
const PER_ATTEMPT_TIMEOUT_MS = 45_000;

function baseFor(provider: ModelConfig["provider"]) {
  if (provider === "nvidia") {
    return {
      url: process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1",
      key: process.env.NVIDIA_API_KEY ?? "",
    };
  }
  return {
    url: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
    key: process.env.DEEPSEEK_API_KEY ?? "",
  };
}

async function chatOnce(
  modelKey: ModelKey,
  opts: {
    messages: ChatMessage[];
    tools?: ToolSchema[];
    onToken?: (t: string) => void;
    deadline: number;
  }
): Promise<ChatResult> {
  const m = MODELS[modelKey];
  const { url, key } = baseFor(m.provider);
  const timeoutMs = Math.max(1000, Math.min(PER_ATTEMPT_TIMEOUT_MS, opts.deadline - Date.now()));

  const res = await fetch(`${url}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      model: m.id,
      messages: opts.messages,
      stream: true,
      temperature: m.temperature,
      top_p: m.top_p,
      max_tokens: m.max_tokens,
      ...(opts.tools?.length ? { tools: opts.tools, tool_choice: "auto" } : {}),
      ...m.extra,
    }),
  });

  if (!res.ok || !res.body) throw new GatewayError(res.status, await res.text());

  const out: ChatResult = { content: "", reasoning: "", toolCalls: [], finish: null, usage: null };
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 2);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      let chunk: any;
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      const c = chunk.choices?.[0];
      if (chunk.usage) out.usage = chunk.usage;
      if (!c) continue;
      const d = c.delta ?? {};
      if (d.reasoning_content) out.reasoning += d.reasoning_content;
      if (d.content) {
        out.content += d.content;
        opts.onToken?.(d.content);
      }
      for (const tc of d.tool_calls ?? []) {
        const slot = (out.toolCalls[tc.index] ??= { id: "", name: "", args: "" });
        if (tc.id) slot.id = tc.id;
        if (tc.function?.name) slot.name += tc.function.name;
        if (tc.function?.arguments) slot.args += tc.function.arguments;
      }
      if (c.finish_reason) out.finish = c.finish_reason;
    }
  }
  return out;
}

/**
 * Chat with automatic one-shot fallback to the model registry's backup
 * model — on a server error, and (the common real-world case) on a
 * provider that's just slow to respond. `deadline` is an absolute epoch ms
 * shared by both attempts, so a hung primary call can't starve the
 * fallback of its own shot within the caller's overall time budget.
 */
export async function chat(
  modelKey: ModelKey,
  opts: {
    messages: ChatMessage[];
    tools?: ToolSchema[];
    onToken?: (t: string) => void;
    deadline: number;
  }
): Promise<ChatResult> {
  try {
    return await chatOnce(modelKey, opts);
  } catch (e) {
    const timedOut = (e as any)?.name === "TimeoutError";
    const serverError = e instanceof GatewayError && (e.status === 429 || e.status >= 500);
    if ((timedOut || serverError) && opts.deadline - Date.now() > 1000) {
      const fb = FALLBACKS[modelKey];
      if (fb !== modelKey) return chatOnce(fb, opts);
    }
    throw e;
  }
}
