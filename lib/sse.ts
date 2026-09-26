/**
 * Stream events to the client as Server-Sent Events while `run` executes.
 * A client disconnecting (closing or reloading the tab) does not stop the
 * run: it keeps working and the page picks it back up. Stopping goes through
 * the /stop endpoint instead. `signal` is kept for callers that want it.
 */
export function sseResponse(req: Request, run: (send: (data: unknown) => void, signal: AbortSignal) => Promise<void>) {
  const encoder = new TextEncoder();
  const ctrl = new AbortController();
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
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
