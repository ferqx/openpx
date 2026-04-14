import type { HarnessSessionRegistry } from "./harness-session-registry";
import { createHttpServer, type RuntimeHttpServer } from "./http/runtime-http-server";

export type HarnessAppServer = {
  runtime: HarnessSessionRegistry;
  http: RuntimeHttpServer;
};

export function createHarnessAppServer(runtime: HarnessSessionRegistry): HarnessAppServer {
  return {
    runtime,
    http: createHttpServer(runtime),
  };
}
