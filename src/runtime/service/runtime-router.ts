import type { RuntimeService } from "./runtime-service";
import { PROTOCOL_VERSION, runtimeCommandSchema } from "./runtime-types";
import type { RuntimeScope } from "./runtime-service";

function parseScope(url: URL): RuntimeScope | undefined {
  const workspaceRoot = url.searchParams.get("workspaceRoot");
  const projectId = url.searchParams.get("projectId");

  if (!workspaceRoot || !projectId) {
    return undefined;
  }

  return { workspaceRoot, projectId };
}

export class RuntimeRouter {
  constructor(private readonly runtime: RuntimeService) {}

  async handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const method = req.method;
    const path = url.pathname;

    // Health check - available at both /health and /v1/health
    if ((path === "/health" || path === "/v1/health") && method === "GET") {
      return Response.json({
        status: "ok",
        version: "0.1.0", // Application version
        protocolVersion: PROTOCOL_VERSION,
      });
    }

    // Snapshot - available at /snapshot and /v1/snapshot
    if ((path === "/snapshot" || path === "/v1/snapshot") && method === "GET") {
      const snapshot = await this.runtime.getSnapshot(parseScope(url));
      return Response.json(snapshot);
    }

    // Commands - available at /commands and /v1/commands
    if ((path === "/commands" || path === "/v1/commands") && method === "POST") {
      try {
        const body = await req.json();
        const command = runtimeCommandSchema.parse(body);
        await this.runtime.handleCommand(command, parseScope(url));
        return new Response(null, { status: 202 });
      } catch (e) {
        return new Response(String(e), { status: 400 });
      }
    }

    // Events - available at /events and /v1/events
    if ((path === "/events" || path === "/v1/events") && method === "GET") {
      const afterSeq = parseInt(url.searchParams.get("after") ?? "0", 10);
      const scope = parseScope(url);
      const stream = new ReadableStream({
        start: async (controller) => {
          for await (const envelope of this.runtime.subscribeEvents(scope, afterSeq)) {
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
  }
}
