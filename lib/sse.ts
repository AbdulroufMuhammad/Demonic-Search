/** Stream events to the client as Server-Sent Events while `run` executes. */
export function sseResponse(run: (send: (data: unknown) => void) => Promise<void>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      try {
        await run(send);
        send({ type: "stream-end" });
      } catch (e) {
        send({ type: "error", payload: { message: e instanceof Error ? e.message : String(e) } });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
