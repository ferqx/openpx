import { describe, expect, test, afterEach } from "bun:test";
import { ensureRuntime } from "../../src/runtime/service/runtime-daemon";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("Multi-Project Isolation", () => {
  const testDir = path.join(os.tmpdir(), `multi-project-test-${Date.now()}-${Math.random()}`);

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (e) {
      // ignore
    }
  });

  test("reuses one device runtime while keeping project snapshots isolated", async () => {
    await fs.mkdir(testDir, { recursive: true });
    const dataDir = path.join(testDir, "data");
    const w1 = path.join(testDir, "w1");
    const w2 = path.join(testDir, "w2");
    await fs.mkdir(dataDir, { recursive: true });
    await fs.mkdir(w1, { recursive: true });
    await fs.mkdir(w2, { recursive: true });

    const info1 = await ensureRuntime({ dataDir, workspaceRoot: w1, projectId: "p1" });
    const info2 = await ensureRuntime({ dataDir, workspaceRoot: w2, projectId: "p2" });

    expect(info1.port).toBe(info2.port);
    expect(info1.pid).toBe(info2.pid);

    const { RuntimeClient } = await import("../../src/surfaces/tui/runtime/runtime-client");
    const client1 = new RuntimeClient(`http://localhost:${info1.port}`, { workspaceRoot: w1, projectId: "p1" });
    const client2 = new RuntimeClient(`http://localhost:${info2.port}`, { workspaceRoot: w2, projectId: "p2" });

    await client1.sendCommand({ kind: "add_task", content: "task for p1" });

    const snapshot1 = await client1.getSnapshot();
    const snapshot2 = await client2.getSnapshot();

    expect(snapshot1.projectId).toBe("p1");
    expect(snapshot1.tasks.some((task) => task.summary.includes("task for p1"))).toBeTrue();
    expect(snapshot2.projectId).toBe("p2");
    expect(snapshot2.tasks.some((task) => task.summary.includes("task for p1"))).toBeFalse();
  });
});
