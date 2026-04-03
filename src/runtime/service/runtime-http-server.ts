import type { RuntimeService } from "./runtime-service";
import { runtimeCommandSchema } from "./runtime-types";

export function createHttpServer(runtime: RuntimeService) {
  return Bun.serve({
    port: 0, // Auto-assign port
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/snapshot" && req.method === "GET") {
        const snapshot = await runtime.getSnapshot();
        return Response.json(snapshot);
      }

      if (url.pathname === "/commands" && req.method === "POST") {
        try {
          const body = await req.json();
          const command = runtimeCommandSchema.parse(body);
          await runtime.handleCommand(command);
          return new Response(null, { status: 202 });
        } catch (e) {
          return new Response(String(e), { status: 400 });
        }
      }

      if (url.pathname === "/events" && req.method === "GET") {
        const afterSeq = parseInt(url.searchParams.get("after") ?? "0", 10);
        const stream = new ReadableStream({
          async start(controller) {
            for await (const envelope of runtime.subscribeEvents(afterSeq)) {
              controller.enqueue(`data: ${JSON.stringify(envelope)}\n\n`);
            }
          }
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
          },
        });
      }

      return new Response("Not Found", { status: 404 });
    },
  });
}
