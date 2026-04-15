/**
 * Harness app server 的 HTTP transport。
 * 它把 harness router 暴露为 Bun server 或 in-memory server，
 * 并统一提供 fetch 语义给 surface 或测试代码消费。
 */
import type { HarnessSessionRegistry } from "../harness-session-registry";
import { HarnessHttpRouter } from "./runtime-router";

const nativeFetch = globalThis.fetch.bind(globalThis);
const inMemoryRouters = new Map<number, HarnessHttpRouter>();
let nextInMemoryPort = 61_000;

export type RuntimeHttpServer = {
  port: number;
  inMemory: boolean;
  stop(closeActiveConnections?: boolean): void;
  fetch(input: Request | string | URL, init?: RequestInit): Promise<Response>;
};

function toRequest(input: Request | string | URL, init?: RequestInit, fallbackPort?: number): Request {
  if (input instanceof Request) {
    return input;
  }

  if (input instanceof URL) {
    return new Request(input.toString(), init);
  }

  if (typeof input === "string") {
    return new Request(input.startsWith("http") ? input : `http://localhost:${fallbackPort ?? 0}${input}`, init);
  }

  return new Request(String(input), init);
}

function shouldFallbackToInMemory(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : "";
  return code === "EADDRINUSE" || code === "EPERM";
}

function createInMemoryServer(router: HarnessHttpRouter): RuntimeHttpServer {
  const port = nextInMemoryPort++;
  inMemoryRouters.set(port, router);

  return {
    port,
    inMemory: true,
    stop() {
      inMemoryRouters.delete(port);
    },
    fetch(input, init) {
      return router.handle(toRequest(input, init, port));
    },
  };
}

export async function dispatchRuntimeRequest(input: Request | string | URL, init?: RequestInit): Promise<Response> {
  const request = toRequest(input, init);
  const url = new URL(request.url);
  const inMemoryRouter = url.hostname === "localhost" ? inMemoryRouters.get(Number(url.port)) : undefined;

  if (inMemoryRouter) {
    return inMemoryRouter.handle(request);
  }

  return nativeFetch(request);
}

export function createHttpServer(runtime: HarnessSessionRegistry): RuntimeHttpServer {
  const router = new HarnessHttpRouter(runtime);

  try {
    const server = Bun.serve({
      port: 0,
      // Runtime event streams can stay idle for long periods between SSE messages.
      idleTimeout: 0,
      async fetch(req) {
        return router.handle(req);
      },
    });

    return {
      port: server.port ?? 0,
      inMemory: false,
      stop(closeActiveConnections) {
        server.stop(closeActiveConnections);
      },
      fetch(input, init) {
        return dispatchRuntimeRequest(toRequest(input, init, server.port));
      },
    };
  } catch (error) {
    if (!shouldFallbackToInMemory(error)) {
      throw error;
    }

    return createInMemoryServer(router);
  }
}
