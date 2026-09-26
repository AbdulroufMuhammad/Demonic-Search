// Raw HTTP model gateway — no vendor SDK. Both providers serve an
// OpenAI-format /chat/completions endpoint, so one client covers both.

export type ModelKey = "glm" | "glm-flash" | "muse" | "omni" | "deepseek";

type ModelConfig = {
  id: string;
  label: string;
  note: string;
  provider: "nvidia" | "deepseek";
  temperature: number;
  top_p: number;
  max_tokens: number;
  extra?: Record<string, unknown>;
};

export const MODELS: Record<ModelKey, ModelConfig> = {
  glm: { id: "z-ai/glm-5.3", label: "GLM 5.3", note: "Best quality", provider: "nvidia", temperature: 0.6, top_p: 1, max_tokens: 16384 },
  "glm-flash": { id: "z-ai/glm-5.3-flash", label: "GLM 5.3 Flash", note: "Faster, lighter", provider: "nvidia", temperature: 0.6, top_p: 1, max_tokens: 16384 },
  deepseek: { id: "deepseek-chat", label: "DeepSeek V3", note: "DeepSeek API", provider: "deepseek", temperature: 0.6, top_p: 1, max_tokens: 8192 },
  omni: {
    id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    label: "Nemotron Omni",
    note: "Reasoning",
    provider: "nvidia",
    temperature: 0.6,
    top_p: 0.95,
    max_tokens: 32768,
    extra: { reasoning_budget: 8192 },
  },
  muse: { id: "meta/muse-glimmer-30b", label: "Muse Glimmer", note: "Experimental", provider: "nvidia", temperature: 0.9, top_p: 0.95, max_tokens: 8192 },
};

export const MODEL_KEYS = Object.keys(MODELS) as ModelKey[];

/** Projects created before the model picker stored "quality" / "fast" profiles. */
export function modelKeyFor(stored: string | null | undefined): ModelKey {
  if (stored && stored in MODELS) return stored as ModelKey;
  return stored === "fast" ? "glm-flash" : "glm";
}

export const FALLBACKS: Record<ModelKey, ModelKey> = {
  glm: "deepseek",
  "glm-flash": "deepseek",
  muse: "glm",
  omni: "glm",
  deepseek: "glm",
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
  /** The model's reasoning stream, for providers that send one (reasoning_content). */
  reasoning: string;
  toolCalls: { id: string; name: string; args: string }[];
  finish: string | null;
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
};

export type ChatOpts = {
  messages: ChatMessage[];
  tools?: ToolSchema[];
  onToken?: (t: string) => void;
  onReasoning?: (t: string) => void;
  onToolDelta?: (index: number, name: string, args: string) => void;
  /** Absolute epoch ms; the whole call (including a fallback attempt) is cut off here. */
  deadline: number;
  signal?: AbortSignal;
};

export class GatewayError extends Error {
  constructor(public status: number, body: string) {
    super(`gateway ${status}: ${body.slice(0, 500)}`);
  }
}

// A design file can take minutes to stream, so the per-attempt limit is on
// silence, not total length: a stream that keeps producing tokens runs until
// the caller's deadline.
const IDLE_TIMEOUT_MS = 45_000;

function baseFor(provider: ModelConfig["provider"]) {
  if (provider === "nvidia") {
    return { url: process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1", key: process.env.NVIDIA_API_KEY ?? "" };
  }
  return { url: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com", key: process.env.DEEPSEEK_API_KEY ?? "" };
}

class IdleTimeout extends Error {
  name = "TimeoutError";
}

async function chatOnce(modelKey: ModelKey, opts: ChatOpts, onFirstByte: () => void): Promise<ChatResult> {
  const m = MODELS[modelKey];
  const { url, key } = baseFor(m.provider);
  const ctrl = new AbortController();
  let idle: ReturnType<typeof setTimeout> | undefined;
  const armIdle = () => {
    clearTimeout(idle);
    idle = setTimeout(() => ctrl.abort(new IdleTimeout("model stopped responding")), IDLE_TIMEOUT_MS);
  };
  const hard = setTimeout(() => ctrl.abort(new IdleTimeout("turn deadline reached")), Math.max(1000, opts.deadline - Date.now()));
  const onAbort = () => ctrl.abort(opts.signal?.reason);
  opts.signal?.addEventListener("abort", onAbort);
  armIdle();

  try {
    const res = await fetch(`${url}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "text/event-stream" },
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
    let first = true;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      armIdle();
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        let chunk: any;
        try {
          chunk = JSON.parse(data);
        } catch {
          continue;
        }
        if (chunk.usage) out.usage = chunk.usage;
        const c = chunk.choices?.[0];
        if (!c) continue;
        const d = c.delta ?? {};
        const thought = d.reasoning_content ?? d.reasoning;
        if (first && (d.content || d.tool_calls || thought)) {
          first = false;
          onFirstByte();
        }
        if (typeof thought === "string" && thought) {
          out.reasoning += thought;
          opts.onReasoning?.(thought);
        }
        if (d.content) {
          out.content += d.content;
          opts.onToken?.(d.content);
        }
        for (const tc of d.tool_calls ?? []) {
          const idx = tc.index ?? 0;
          const slot = (out.toolCalls[idx] ??= { id: "", name: "", args: "" });
          if (tc.id) slot.id = tc.id;
          if (tc.function?.name) slot.name += tc.function.name;
          if (tc.function?.arguments) {
            slot.args += tc.function.arguments;
            opts.onToolDelta?.(idx, slot.name, slot.args);
          }
        }
        if (c.finish_reason) out.finish = c.finish_reason;
      }
    }
    out.toolCalls = out.toolCalls.filter(Boolean);
    return out;
  } catch (e) {
    if (ctrl.signal.aborted && ctrl.signal.reason instanceof Error) throw ctrl.signal.reason;
    throw e;
  } finally {
    clearTimeout(idle);
    clearTimeout(hard);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Chat with a one-shot fallback to the registry's backup model when the
 * primary provider fails before sending anything (auth error, rate limit,
 * 5xx, or silence). Once tokens have streamed to the user, a failure is
 * surfaced instead of silently restarting on another model.
 */
export async function chat(modelKey: ModelKey, opts: ChatOpts): Promise<ChatResult> {
  let streamed = false;
  try {
    return await chatOnce(modelKey, opts, () => (streamed = true));
  } catch (e) {
    if (streamed || opts.signal?.aborted) throw e;
    const timedOut = (e as any)?.name === "TimeoutError";
    const providerFailure = e instanceof GatewayError && (e.status === 401 || e.status === 403 || e.status === 429 || e.status >= 500);
    const fb = FALLBACKS[modelKey];
    if ((timedOut || providerFailure) && fb !== modelKey && opts.deadline - Date.now() > 5000) {
      return chatOnce(fb, opts, () => {});
    }
    throw e;
  }
}
