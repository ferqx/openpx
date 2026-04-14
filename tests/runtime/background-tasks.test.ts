import { describe, expect, test, afterEach, mock } from "bun:test";
import { createHarnessSessionRegistry } from "../../src/harness/server/harness-session-registry";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("Background Tasks", () => {
  const testDir = path.join(os.tmpdir(), `background-tasks-test-${Date.now()}-${Math.random()}`);

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (e) {
      // ignore
    }
  });

  test("returns immediately when background: true is set", async () => {
    await fs.mkdir(testDir, { recursive: true });
    const dataDir = path.join(testDir, "test.db");
    const workspaceRoot = testDir;

    const runtime = await createHarnessSessionRegistry({ dataDir, workspaceRoot });
    
    const startTime = Date.now();
    await runtime.handleCommand({ 
      kind: "add_task", 
      content: "fix task", 
      background: true 
    });
    const duration = Date.now() - startTime;

    // It should return very quickly (e.g., < 100ms) even if task takes longer
    expect(duration).toBeLessThan(200);

    // Give the background task time to finish
    await new Promise(r => setTimeout(r, 500));

    const snapshot = await runtime.getSnapshot();
    // The task should eventually be in snapshot
    expect(snapshot.tasks.length).toBeGreaterThan(0);
  });
});
