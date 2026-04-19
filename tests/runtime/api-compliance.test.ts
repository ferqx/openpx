import { describe, test, expect, mock, beforeEach } from "bun:test";
import { HarnessHttpRouter } from "../../src/harness/server/http/runtime-router";
import { schemas } from "../../src/harness/protocol/schemas/api-schema";
import {
  CURRENT_PROTOCOL_VERSION as PROTOCOL_VERSION,
  PROTOCOL_VERSION_HEADER,
} from "../../src/harness/protocol/schemas/protocol-version";
import type { RuntimeCommand } from "../../src/harness/protocol/schemas/api-schema";
import type { HarnessSessionRegistry } from "../../src/harness/server/harness-session-registry";

describe("Stable Control API Compliance", () => {
  let runtime: HarnessSessionRegistry;
  let router: HarnessHttpRouter;

  beforeEach(() => {
    runtime = {
      getSnapshot: mock(async () => ({
        protocolVersion: PROTOCOL_VERSION,
        workspaceRoot: "/test",
        projectId: "test-project",
        lastEventSeq: 0,
        activeRunId: undefined,
        threadMode: "normal",
        threads: [],
        runs: [],
        tasks: [],
        pendingApprovals: [],
        answers: [],
        workers: [],
      })),
      handleCommand: mock(async (_command: RuntimeCommand) => {}),
      subscribeEvents: mock(() => {
        async function* gen() {
          yield {
            protocolVersion: PROTOCOL_VERSION,
            seq: 1,
            timestamp: new Date().toISOString(),
            traceId: "test-trace-id",
            event: {
              type: "thread.view_updated",
              payload: {
                threadId: "thread-1",
                threadMode: "normal",
                status: "active",
              },
            },
          };
        }
        return gen();
      }),
    } as unknown as HarnessSessionRegistry;
    router = new HarnessHttpRouter(runtime);
  });

  test("GET /v1/health matches healthResponseSchema", async () => {
    const req = new Request("http://localhost/v1/health");
    const res = await router.handle(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { protocolVersion: string };
    const result = schemas.HealthResponse.safeParse(body);
    expect(result.success).toBe(true);
    expect(body.protocolVersion).toBe(PROTOCOL_VERSION);
  });

  test("GET /v1/snapshot matches runtimeSnapshotSchema", async () => {
    const req = new Request("http://localhost/v1/snapshot");
    const res = await router.handle(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    const result = schemas.RuntimeSnapshot.safeParse(body);
    expect(result.success).toBe(true);
  });

  test("POST /v1/commands accepts valid commands", async () => {
    const command = { kind: "new_thread" };
    const req = new Request("http://localhost/v1/commands?workspaceRoot=%2Ftest&projectId=test-project", {
      method: "POST",
      body: JSON.stringify(command),
    });
    const res = await router.handle(req);
    expect(res.status).toBe(202);
    expect(runtime.handleCommand).toHaveBeenCalledWith(command, {
      workspaceRoot: "/test",
      projectId: "test-project",
    });
  });

  test("runtime command schema accepts explicit approval decision commands", () => {
    expect(
      schemas.RuntimeCommand.safeParse({
        kind: "resolve_approval",
        approvalRequestId: "approval-1",
        decision: "approved",
      }).success,
    ).toBe(true);
  });

  test("runtime command schema accepts interrupt commands", () => {
    expect(
      schemas.RuntimeCommand.safeParse({
        kind: "interrupt",
        threadId: "thread-1",
      }).success,
    ).toBe(true);
  });

  test("runtime command schema accepts planning task commands", () => {
    expect(
      schemas.RuntimeCommand.safeParse({
        kind: "plan_task",
        content: "design the rollout",
      }).success,
    ).toBe(true);
  });

  test("runtime command schema accepts thread mode toggle commands", () => {
    expect(
      schemas.RuntimeCommand.safeParse({
        kind: "set_thread_mode",
        threadId: "thread-1",
        mode: "plan",
        trigger: "slash_command",
      }).success,
    ).toBe(true);

    expect(
      schemas.RuntimeCommand.safeParse({
        kind: "clear_thread_mode",
        threadId: "thread-1",
        trigger: "plain_input",
      }).success,
    ).toBe(true);
  });

  test("runtime command schema accepts worker lifecycle commands", () => {
    expect(
      schemas.RuntimeCommand.safeParse({
        kind: "worker_spawn",
        taskId: "task-1",
        role: "planner",
        spawnReason: "hydrate runtime truth",
      }).success,
    ).toBe(true);
    expect(
      schemas.RuntimeCommand.safeParse({
        kind: "worker_resume",
        workerId: "worker-1",
      }).success,
    ).toBe(true);
  });

  test("POST /v1/commands rejects invalid commands", async () => {
    const consoleErrorSpy = mock(() => undefined);
    const originalConsoleError = console.error;
    console.error = consoleErrorSpy as typeof console.error;

    const command = { kind: "invalid_command" };
    try {
      const req = new Request("http://localhost/v1/commands", {
        method: "POST",
        body: JSON.stringify(command),
      });
      const res = await router.handle(req);
      expect(res.status).toBe(400);
      const body = await res.json() as { error?: string; details?: unknown };
      expect(body.error).toBe("Invalid command payload");
      expect(body.details).toBeDefined();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    } finally {
      console.error = originalConsoleError;
    }
  });

  test("GET /v1/events returns valid event stream", async () => {
    const req = new Request("http://localhost/v1/events");
    const res = await router.handle(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    
    const reader = res.body?.getReader();
    const { value, done } = await reader!.read();
    expect(done).toBe(false);
    expect(value).toBeDefined();
    const text = typeof value === "string" ? value : new TextDecoder().decode(value);
    const dataMatch = text.match(/data: (.*)\n\n/);
    expect(dataMatch).not.toBeNull();
    if (!dataMatch) throw new Error("No data match");
    const event = JSON.parse(dataMatch[1]!);
    const result = schemas.RuntimeEventEnvelope.safeParse(event);
    expect(result.success).toBe(true);
  });

  test("GET /v1/snapshot rejects unsupported protocol versions", async () => {
    const req = new Request("http://localhost/v1/snapshot", {
      headers: {
        [PROTOCOL_VERSION_HEADER]: "9.9.9",
      },
    });
    const res = await router.handle(req);
    expect(res.status).toBe(400);
    const body = await res.json() as { error?: string; supportedVersions?: string[] };
    expect(body.error).toContain("Unsupported protocol version");
    expect(body.supportedVersions).toContain(PROTOCOL_VERSION);
  });

  test("runtime event schema rejects unknown event names", () => {
    expect(
      schemas.RuntimeEvent.safeParse({
        type: "test",
      }).success,
    ).toBe(false);
  });

  test("runtime event schema rejects invalid payloads for stable event types", () => {
    expect(
      schemas.RuntimeEvent.safeParse({
        type: "thread.view_updated",
        payload: {
          threadId: "thread-1",
        },
      }).success,
    ).toBe(false);
  });

  test("runtime event schema accepts worker lifecycle events", () => {
    expect(
      schemas.RuntimeEvent.safeParse({
        type: "worker.spawned",
        payload: {
          worker: {
            workerId: "worker-1",
            threadId: "thread-1",
            taskId: "task-1",
            role: "planner",
            status: "running",
            spawnReason: "hydrate runtime truth",
          },
        },
      }).success,
    ).toBe(true);
  });

  test("runtime event schema accepts thread mode change events", () => {
    expect(
      schemas.RuntimeEvent.safeParse({
        type: "thread.mode_changed",
        payload: {
          threadId: "thread-1",
          fromMode: "normal",
          toMode: "plan",
          trigger: "slash_command",
        },
      }).success,
    ).toBe(true);
  });

  test("legacy endpoints still work for backward compatibility", async () => {
    const snapshotReq = new Request("http://localhost/snapshot");
    const snapshotRes = await router.handle(snapshotReq);
    expect(snapshotRes.status).toBe(200);

    const healthReq = new Request("http://localhost/health");
    const healthRes = await router.handle(healthReq);
    expect(healthRes.status).toBe(200);
  });
});
