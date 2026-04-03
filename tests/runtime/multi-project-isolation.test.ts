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

  test("starts separate daemons for different projectIds in the same dataDir", async () => {
    await fs.mkdir(testDir, { recursive: true });
    const dataDir = path.join(testDir, "data");
    const w1 = path.join(testDir, "w1");
    const w2 = path.join(testDir, "w2");
    await fs.mkdir(dataDir, { recursive: true });
    await fs.mkdir(w1, { recursive: true });
    await fs.mkdir(w2, { recursive: true });

    const info1 = await ensureRuntime({ dataDir, workspaceRoot: w1, projectId: "p1" });
    const info2 = await ensureRuntime({ dataDir, workspaceRoot: w2, projectId: "p2" });

    expect(info1.port).not.toBe(info2.port);
    expect(info1.pid).toBe(info2.pid); // Still same process because we are calling ensureRuntime in same process
    // Actually, in our simple implementation, ensureRuntime returns the same PID if it's the current process
    // but the PORT should be different because they are different servers.
    // Wait, currently ensureRuntime starts a NEW server if the lockfile doesn't exist.
    // Each call to ensureRuntime starts a server.
  });
});
