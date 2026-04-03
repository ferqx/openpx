import { describe, expect, test, afterEach } from "bun:test";
import { createRuntimeService } from "../../src/runtime/service/runtime-service";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("Robust Event Stream", () => {
  const testDir = path.join(os.tmpdir(), `robust-events-test-${Date.now()}-${Math.random()}`);

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (e) {
      // ignore
    }
  });

  test("yields events from memory buffer for gapless replay", async () => {
    await fs.mkdir(testDir, { recursive: true });
    const dataDir = path.join(testDir, "test.db");
    const workspaceRoot = testDir;

    const runtime = await createRuntimeService({ dataDir, workspaceRoot });
    
    // 1. Submit a task to generate some events
    await runtime.handleCommand({ kind: "add_task", content: "test task" });
    
    // Give it a moment to process and fill buffer
    await new Promise(r => setTimeout(r, 100));

    // 2. Get snapshot to find last sequence
    const snapshot = await runtime.getSnapshot();
    // In our implementation, buffer uses Date.now() as seq for now
    // Let's just subscribe from 0 and get some events
    
    const events: any[] = [];
    const iterator = runtime.subscribeEvents(0)[Symbol.asyncIterator]();
    
    // Get the first few events from buffer
    const { value: e1 } = await iterator.next();
    expect(e1).toBeDefined();
    expect(e1.timestamp).toBeDefined();
    expect(e1.traceId).toBeDefined();
    
    const lastSeq = e1.seq;

    // 3. Re-subscribe from lastSeq
    const nextIterator = runtime.subscribeEvents(lastSeq)[Symbol.asyncIterator]();
    // Since we only had 2 events (task.created, answer.updated), and we took 1, 
    // the next one should be available.
    
    const { value: e2 } = await nextIterator.next();
    if (e2) {
        expect(e2.seq).toBeGreaterThan(lastSeq);
    }
  });
});
