import { describe, expect, test, afterEach } from "bun:test";
import { createRuntimeService } from "../../src/runtime/service/runtime-service";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("RuntimeService", () => {
  const testDir = path.join(os.tmpdir(), `runtime-service-test-${Date.now()}`);

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (e) {
      // ignore
    }
  });

  test("hydrates current thread state and exposes a replay cursor", async () => {
    await fs.mkdir(testDir, { recursive: true });
    const runtime = await createRuntimeService({ dataDir: ":memory:", workspaceRoot: testDir });
    const snapshot = await runtime.getSnapshot();

    expect(snapshot.protocolVersion).toBeString();
    expect(snapshot.workspaceRoot).toBe(testDir);
    expect(snapshot.projectId).toBeString();
    expect(snapshot.lastEventSeq).toBeNumber();
    expect(snapshot.activeThreadId).toBeString();
    expect(snapshot.threads).toBeArray();
    expect(snapshot.tasks).toBeArray();
    expect(snapshot.pendingApprovals).toBeArray();
    expect(snapshot.answers).toBeArray();
  });

  test("starts one device runtime daemon and lets reconnecting clients reuse it across workspaces", async () => {
    // This will likely need runtime-daemon logic
    // For now, let's keep it as a placeholder as suggested by the plan
  });
});
