import { describe, expect, test, afterEach } from "bun:test";
import { createRuntimeService } from "../../src/runtime/service/runtime-service";
import { createHttpServer } from "../../src/runtime/service/runtime-http-server";
import { RuntimeClient } from "../../src/interface/runtime/runtime-client";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("Hydrate and Replay", () => {
  const testDir = path.join(os.tmpdir(), `hydrate-replay-test-${Date.now()}-${Math.random()}`);

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (e) {
      // ignore
    }
  });

  test("replays events after the snapshot cursor without gaps", async () => {
    await fs.mkdir(testDir, { recursive: true });
    const dataDir = path.join(testDir, "test.db");
    const workspaceRoot = testDir;

    const runtime = await createRuntimeService({ dataDir, workspaceRoot });
    const server = createHttpServer(runtime);

    try {
      const client = new RuntimeClient(`http://localhost:${server.port}`);
      
      // 1. Submit initial input to create some events
      await client.sendCommand({ kind: "add_task", content: "fix task1.ts" });
      
      // 2. Take snapshot
      const snapshot = await client.getSnapshot();
      const lastSeq = snapshot.lastEventSeq;
      expect(lastSeq).toBeGreaterThan(0);

      // 3. Submit more input to create more events
      await client.sendCommand({ kind: "add_task", content: "fix task2.ts" });

      // 4. Subscribe from lastSeq
      const events: any[] = [];
      const iterator = client.subscribeEvents(lastSeq)[Symbol.asyncIterator]();
      
      // Get the next event
      const { value } = await iterator.next();
      expect(value).toBeDefined();
      expect(value.seq).toBeGreaterThan(lastSeq);
      
    } finally {
      server.stop();
    }
  });
});
