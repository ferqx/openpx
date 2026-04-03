import { describe, expect, test, afterEach } from "bun:test";
import { ensureRuntime } from "../../src/runtime/service/runtime-daemon";
import { RuntimeClient } from "../../src/interface/runtime/runtime-client";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("Runtime Client Reconnect", () => {
  const testDir = path.join(os.tmpdir(), `runtime-reconnect-test-${Date.now()}`);

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (e) {
      // ignore
    }
  });

  test("connects to an existing daemon if available", async () => {
    await fs.mkdir(testDir, { recursive: true });
    const dataDir = path.join(testDir, "data");
    const workspaceRoot = path.join(testDir, "workspace");
    const otherWorkspaceRoot = path.join(testDir, "workspace-2");
    await fs.mkdir(dataDir, { recursive: true });
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.mkdir(otherWorkspaceRoot, { recursive: true });

    const info1 = await ensureRuntime({ dataDir, workspaceRoot, projectId: "project-a" });
    const info2 = await ensureRuntime({ dataDir, workspaceRoot: otherWorkspaceRoot, projectId: "project-b" });

    expect(info1.port).toBe(info2.port);
    expect(info1.pid).toBe(info2.pid);

    const client = new RuntimeClient(`http://localhost:${info1.port}`, {
      workspaceRoot,
      projectId: "project-a",
    });
    const snapshot = await client.getSnapshot();
    expect(snapshot.workspaceRoot).toBe(workspaceRoot);
    expect(snapshot.projectId).toBe("project-a");
  });
});
