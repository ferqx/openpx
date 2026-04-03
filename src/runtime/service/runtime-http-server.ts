import type { RuntimeService } from "./runtime-service";
import { RuntimeRouter } from "./runtime-router";

export function createHttpServer(runtime: RuntimeService) {
  const router = new RuntimeRouter(runtime);
  return Bun.serve({
    port: 0, // Auto-assign port
    async fetch(req) {
      return router.handle(req);
    },
  });
}
