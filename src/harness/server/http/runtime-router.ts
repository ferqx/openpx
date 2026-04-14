import { ZodError } from "zod";
import type { HarnessSessionRegistry } from "../harness-session-registry";
import type { HarnessSessionScope } from "../harness-session-scope";
import { runtimeCommandSchema } from "../../protocol/commands/runtime-command-schema";
import { CURRENT_PROTOCOL_VERSION as PROTOCOL_VERSION, PROTOCOL_VERSION_HEADER } from "../../protocol/schemas/protocol-version";

function parseScope(url: URL): HarnessSessionScope | undefined {
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

/**
 * Harness app server 的 HTTP router。
 *
 * 它负责：
 * - 暴露 snapshot / commands / events 等协议入口
 * - 校验协议版本
 * - 保证 surface 通过稳定契约访问 harness
 */
export class HarnessHttpRouter {
  constructor(private readonly runtime: HarnessSessionRegistry) {}

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
        if (error instanceof ZodError) {
          return Response.json({
            error: "Invalid command payload",
            details: error.flatten(),
          }, {
            status: 400,
            headers: createProtocolHeaders(),
          });
        }

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
