import { describe, expect, test, afterEach } from "bun:test";
import { createRuntimeService } from "../../src/runtime/service/runtime-service";
import { createHttpServer } from "../../src/runtime/service/runtime-http-server";
import type { RuntimeSnapshot } from "../../src/runtime/service/runtime-types";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("Runtime HTTP Server", () => {
  const testDir = path.join(os.tmpdir(), `runtime-http-test-${Date.now()}`);

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (e) {
      // ignore
    }
  });

  test("GET /snapshot returns the current state", async () => {
    await fs.mkdir(testDir, { recursive: true });
    const runtime = await createRuntimeService({ dataDir: ":memory:", workspaceRoot: testDir });
    const server = createHttpServer(runtime);

    try {
      const res = await server.fetch(`/snapshot?workspaceRoot=${encodeURIComponent(testDir)}&projectId=test-project`);
      expect(res.status).toBe(200);
      const snapshot = await res.json() as RuntimeSnapshot;
      expect(snapshot.workspaceRoot).toBe(testDir);
      expect(snapshot.activeThreadId).toBeString();
    } finally {
      server.stop();
    }
  });

  test("POST /commands accepts and routes commands", async () => {
    await fs.mkdir(testDir, { recursive: true });
    const runtime = await createRuntimeService({ dataDir: ":memory:", workspaceRoot: testDir });
    const server = createHttpServer(runtime);

    try {
      const res = await server.fetch(`/commands?workspaceRoot=${encodeURIComponent(testDir)}&projectId=test-project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "add_task", content: "test task" }),
      });
      expect(res.status).toBe(202);
    } finally {
      server.stop();
    }
  });
});
