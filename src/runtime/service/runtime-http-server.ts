import type { RuntimeService } from "./runtime-service";
import { RuntimeRouter } from "./runtime-router";

const nativeFetch = globalThis.fetch.bind(globalThis);
const inMemoryRouters = new Map<number, RuntimeRouter>();
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

function createInMemoryServer(router: RuntimeRouter): RuntimeHttpServer {
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

export function createHttpServer(runtime: RuntimeService): RuntimeHttpServer {
  const router = new RuntimeRouter(runtime);

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
