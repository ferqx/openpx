import { describe, test, expect, mock, beforeEach } from "bun:test";
import { RuntimeRouter } from "../../src/runtime/service/runtime-router";
import { PROTOCOL_VERSION, schemas } from "../../src/runtime/service/runtime-types";
import type { RuntimeService } from "../../src/runtime/service/runtime-service";

describe("Stable Control API Compliance", () => {
  let runtime: RuntimeService;
  let router: RuntimeRouter;

  beforeEach(() => {
    runtime = {
      getSnapshot: mock(async () => ({
        protocolVersion: PROTOCOL_VERSION,
        workspaceRoot: "/test",
        projectId: "test-project",
        lastEventSeq: 0,
        threads: [],
        tasks: [],
        pendingApprovals: [],
        answers: [],
      })),
      handleCommand: mock(async () => {}),
      subscribeEvents: mock(() => {
        async function* gen() {
          yield {
            protocolVersion: PROTOCOL_VERSION,
            seq: 1,
            event: { type: "test" },
          };
        }
        return gen();
      }),
    } as unknown as RuntimeService;
    router = new RuntimeRouter(runtime);
  });

  test("GET /v1/health matches healthResponseSchema", async () => {
    const req = new Request("http://localhost/v1/health");
    const res = await router.handle(req);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
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
    const req = new Request("http://localhost/v1/commands", {
      method: "POST",
      body: JSON.stringify(command),
    });
    const res = await router.handle(req);
    expect(res.status).toBe(202);
    expect(runtime.handleCommand).toHaveBeenCalledWith(command as any);
  });

  test("POST /v1/commands rejects invalid commands", async () => {
    const command = { kind: "invalid_command" };
    const req = new Request("http://localhost/v1/commands", {
      method: "POST",
      body: JSON.stringify(command),
    });
    const res = await router.handle(req);
    expect(res.status).toBe(400);
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

  test("legacy endpoints still work for backward compatibility", async () => {
    const snapshotReq = new Request("http://localhost/snapshot");
    const snapshotRes = await router.handle(snapshotReq);
    expect(snapshotRes.status).toBe(200);

    const healthReq = new Request("http://localhost/health");
    const healthRes = await router.handle(healthReq);
    expect(healthRes.status).toBe(200);
  });
});
