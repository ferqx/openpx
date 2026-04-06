import type { RuntimeService } from "./runtime-service";
import { PROTOCOL_VERSION, PROTOCOL_VERSION_HEADER, runtimeCommandSchema } from "./runtime-types";
import type { RuntimeScope } from "./runtime-service";

function parseScope(url: URL): RuntimeScope | undefined {
  const workspaceRoot = url.searchParams.get("workspaceRoot");
  const projectId = url.searchParams.get("projectId");

  if (!workspaceRoot || !projectId) {
    return undefined;
  }

  return { workspaceRoot, projectId };
}

function resolveRequestedProtocolVersion(req: Request, url: URL): string {
  return req.headers.get(PROTOCOL_VERSION_HEADER) ?? url.searchParams.get("protocolVersion") ?? PROTOCOL_VERSION;
}

function createProtocolHeaders(): Record<string, string> {
  return {
    [PROTOCOL_VERSION_HEADER]: PROTOCOL_VERSION,
  };
}

export class RuntimeRouter {
  constructor(private readonly runtime: RuntimeService) {}

  async handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const method = req.method;
    const path = url.pathname;
    const requestedProtocolVersion = resolveRequestedProtocolVersion(req, url);

    if (requestedProtocolVersion !== PROTOCOL_VERSION) {
      return Response.json({
        error: `Unsupported protocol version: ${requestedProtocolVersion}`,
        supportedVersions: [PROTOCOL_VERSION],
      }, {
        status: 400,
        headers: createProtocolHeaders(),
      });
    }

    // Health check - available at both /health and /v1/health
    if ((path === "/health" || path === "/v1/health") && method === "GET") {
      return Response.json({
        status: "ok",
        version: "0.1.0", // Application version
        protocolVersion: PROTOCOL_VERSION,
      }, {
        headers: createProtocolHeaders(),
      });
    }

    // Snapshot - available at /snapshot and /v1/snapshot
    if ((path === "/snapshot" || path === "/v1/snapshot") && method === "GET") {
      const snapshot = await this.runtime.getSnapshot(parseScope(url));
      return Response.json(snapshot, {
        headers: createProtocolHeaders(),
      });
    }

    // Commands - available at /commands and /v1/commands
    if ((path === "/commands" || path === "/v1/commands") && method === "POST") {
      try {
        const body = await req.json();
        const command = runtimeCommandSchema.parse(body);
        const result = await this.runtime.handleCommand(command, parseScope(url));
        return new Response(JSON.stringify(result ?? null), {
          status: 202,
          headers: {
            "Content-Type": "application/json",
            ...createProtocolHeaders(),
          },
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const stack = error instanceof Error ? error.stack : undefined;
        const details = error instanceof Error ? error.name : "UnknownError";
        console.error(`[API ERROR] Command failed: ${message}`, error);
        return Response.json({ 
          error: message, 
          stack,
          details,
        }, {
          status: 400,
          headers: createProtocolHeaders(),
        });
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
          ...createProtocolHeaders(),
        },
      });
    }

    return new Response("Not Found", { status: 404 });
  }
}
