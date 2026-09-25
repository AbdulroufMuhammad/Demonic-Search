// TEMPORARY diagnostic route — isolates whether NVIDIA_API_KEY and
// DEEPSEEK_API_KEY are each individually valid, by calling each provider
// directly with a 1-token request. Returns only status codes and each
// provider's own masked error text (already safe to display), never a key
// itself. Delete after use.
export const dynamic = "force-dynamic";

async function probe(url: string, key: string, model: string) {
  try {
    const res = await fetch(`${url}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 1 }),
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    return { status: res.status, ok: res.ok, body: text.slice(0, 300) };
  } catch (e) {
    return { status: null, ok: false, body: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET() {
  const [nvidia, deepseek] = await Promise.all([
    probe(process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1", process.env.NVIDIA_API_KEY ?? "", "z-ai/glm-5.3-flash"),
    probe(process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com", process.env.DEEPSEEK_API_KEY ?? "", "deepseek-chat"),
  ]);
  return Response.json({ nvidia, deepseek });
}
