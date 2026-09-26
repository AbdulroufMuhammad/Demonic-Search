/**
 * Stream events to the client as Server-Sent Events while `run` executes.
 * `signal` aborts when the client disconnects (the Stop button), so the run
 * can stop at its next checkpoint instead of spending tokens nobody reads.
 */
export function sseResponse(req: Request, run: (send: (data: unknown) => void, signal: AbortSignal) => Promise<void>) {
  const encoder = new TextEncoder();
  const ctrl = new AbortController();
  req.signal?.addEventListener("abort", () => ctrl.abort());
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      try {
        await run(send, ctrl.signal);
        send({ type: "stream-end" });
      } catch (e) {
        send({ type: "error", payload: { message: e instanceof Error ? e.message : String(e) } });
        send({ type: "stream-end" });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {}
      }
    },
    cancel() {
      closed = true;
      ctrl.abort();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
