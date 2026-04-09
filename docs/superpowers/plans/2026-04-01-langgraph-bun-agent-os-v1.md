# LangGraph Bun Agent OS V1 Implementation Plan

Date: 2026-04-01
Status: Historical
Superseded by:
- `ROADMAP.md`
- `docs/superpowers/specs/2026-04-06-agent-os-reset-design.md`
- `docs/superpowers/plans/2026-04-06-agent-os-reset-plan.md`

## Reset Notice

This plan has been superseded as the active implementation baseline by the reset design and reset plan.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local, TUI-first agent OS kernel on Bun and LangGraph with explicit threads, tasks, workers, policy-gated tools, SQLite-backed persistence, and a user-facing answer pane that summarizes real code changes and verification.

**Architecture:** The implementation keeps `LangGraph` as the execution runtime behind a `SessionKernel` and explicit control-plane services. Persistence is split between LangGraph checkpointing via SQLite and application stores for threads, tasks, events, approvals, and three-tier memory. The TUI is an event-driven task shell built on Ink, not a generic chat window.

**Tech Stack:** Bun, TypeScript, `@langchain/langgraph`, `@langchain/core`, `@langchain/openai`, `@langchain/langgraph-checkpoint-sqlite`, `zod`, `react`, `ink`, `ink-text-input`, `ink-testing-library`, `bun:sqlite`

---

## Planned File Map

### App and Config

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `bunfig.toml`
- Create: `.gitignore`
- Create: `src/app/main.ts`
- Create: `src/app/bootstrap.ts`
- Create: `src/shared/config.ts`

### Domain and Shared Types

- Create: `src/shared/ids.ts`
- Create: `src/shared/errors.ts`
- Create: `src/shared/schemas.ts`
- Create: `src/domain/thread.ts`
- Create: `src/domain/task.ts`
- Create: `src/domain/worker.ts`
- Create: `src/domain/event.ts`
- Create: `src/domain/approval.ts`
- Create: `src/domain/memory.ts`
- Create: `src/domain/tool-call.ts`

### Persistence

- Create: `src/persistence/ports/storage-port.ts`
- Create: `src/persistence/ports/checkpoint-port.ts`
- Create: `src/persistence/ports/task-store-port.ts`
- Create: `src/persistence/ports/memory-store-port.ts`
- Create: `src/persistence/ports/event-log-port.ts`
- Create: `src/persistence/sqlite/sqlite-client.ts`
- Create: `src/persistence/sqlite/sqlite-migrator.ts`
- Create: `src/persistence/sqlite/sqlite-task-store.ts`
- Create: `src/persistence/sqlite/sqlite-memory-store.ts`
- Create: `src/persistence/sqlite/sqlite-event-log.ts`
- Create: `src/persistence/sqlite/sqlite-thread-store.ts`
- Create: `src/persistence/sqlite/sqlite-approval-store.ts`
- Create: `src/persistence/sqlite/sqlite-checkpointer.ts`

### Kernel and Control Plane

- Create: `src/kernel/command-bus.ts`
- Create: `src/kernel/event-bus.ts`
- Create: `src/kernel/thread-service.ts`
- Create: `src/kernel/interrupt-service.ts`
- Create: `src/kernel/session-kernel.ts`
- Create: `src/control/tasks/task-types.ts`
- Create: `src/control/tasks/task-manager.ts`
- Create: `src/control/workers/worker-types.ts`
- Create: `src/control/workers/worker-runtime.ts`
- Create: `src/control/workers/worker-manager.ts`
- Create: `src/control/policy/risk-model.ts`
- Create: `src/control/policy/policy-engine.ts`
- Create: `src/control/policy/approval-service.ts`
- Create: `src/control/memory/memory-types.ts`
- Create: `src/control/memory/retrieval-policy.ts`
- Create: `src/control/memory/memory-service.ts`
- Create: `src/control/tools/tool-types.ts`
- Create: `src/control/tools/tool-registry.ts`
- Create: `src/control/tools/executors/read-file.ts`
- Create: `src/control/tools/executors/apply-patch.ts`
- Create: `src/control/tools/executors/exec.ts`

### Runtime

- Create: `src/runtime/graph/root/state.ts`
- Create: `src/runtime/graph/root/context.ts`
- Create: `src/runtime/graph/root/graph.ts`
- Create: `src/runtime/graph/root/nodes/intake.ts`
- Create: `src/runtime/graph/root/nodes/route.ts`
- Create: `src/runtime/graph/root/nodes/post-turn-guard.ts`
- Create: `src/runtime/workers/planner/graph.ts`
- Create: `src/runtime/workers/executor/graph.ts`
- Create: `src/runtime/workers/verifier/graph.ts`
- Create: `src/runtime/workers/memory-maintainer/graph.ts`

### TUI

- Create: `src/interface/tui/app.tsx`
- Create: `src/interface/tui/screen.tsx`
- Create: `src/interface/tui/commands.ts`
- Create: `src/interface/tui/hooks/use-kernel.ts`
- Create: `src/interface/tui/components/composer.tsx`
- Create: `src/interface/tui/components/event-stream.tsx`
- Create: `src/interface/tui/components/task-panel.tsx`
- Create: `src/interface/tui/components/approval-panel.tsx`
- Create: `src/interface/tui/components/answer-pane.tsx`

### Tests

- Create: `tests/app/bootstrap.test.ts`
- Create: `tests/domain/thread.test.ts`
- Create: `tests/domain/task.test.ts`
- Create: `tests/domain/approval.test.ts`
- Create: `tests/persistence/sqlite-task-store.test.ts`
- Create: `tests/persistence/sqlite-memory-store.test.ts`
- Create: `tests/persistence/sqlite-event-log.test.ts`
- Create: `tests/kernel/session-kernel.test.ts`
- Create: `tests/control/policy-engine.test.ts`
- Create: `tests/control/tool-registry.test.ts`
- Create: `tests/control/task-manager.test.ts`
- Create: `tests/control/worker-manager.test.ts`
- Create: `tests/runtime/root-graph.test.ts`
- Create: `tests/runtime/interrupt-resume.test.ts`
- Create: `tests/interface/tui-app.test.tsx`
- Create: `tests/interface/answer-pane.test.tsx`

## Task 1: Scaffold the Bun Workspace and Runtime Bootstrap

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `bunfig.toml`
- Create: `.gitignore`
- Create: `src/shared/config.ts`
- Create: `src/app/bootstrap.ts`
- Create: `src/app/main.ts`
- Test: `tests/app/bootstrap.test.ts`

- [ ] **Step 1: Initialize the repository scaffold**

Configuration scaffolding is the only non-TDD exception in this plan.

Run:

```bash
git init
bun init -y
bun add @langchain/langgraph @langchain/core @langchain/openai @langchain/langgraph-checkpoint-sqlite zod react ink ink-text-input
bun add -d typescript @types/bun ink-testing-library @types/ink-testing-library
```

Expected:

- `package.json`, `tsconfig.json`, and lockfile exist
- the repository has a `.git/` directory

- [ ] **Step 2: Write the failing bootstrap test**

```ts
import { describe, expect, test } from "bun:test";
import { createAppContext } from "../../src/app/bootstrap";

describe("createAppContext", () => {
  test("builds a local sqlite-backed app context", async () => {
    const ctx = await createAppContext({
      workspaceRoot: "/tmp/demo-workspace",
      dataDir: ":memory:",
    });

    expect(ctx.config.workspaceRoot).toBe("/tmp/demo-workspace");
    expect(ctx.config.checkpointConnString).toBe(":memory:");
    expect(typeof ctx.kernel.handleCommand).toBe("function");
  });
});
```

- [ ] **Step 3: Run the bootstrap test to verify it fails**

Run:

```bash
bun test tests/app/bootstrap.test.ts
```

Expected: FAIL because `createAppContext` is missing.

- [ ] **Step 4: Write minimal bootstrap and config code**

```ts
// src/shared/config.ts
export type AppConfig = {
  workspaceRoot: string;
  dataDir: string;
  checkpointConnString: string;
};

export function resolveConfig(input: { workspaceRoot: string; dataDir: string }): AppConfig {
  return {
    workspaceRoot: input.workspaceRoot,
    dataDir: input.dataDir,
    checkpointConnString: input.dataDir,
  };
}
```

```ts
// src/app/bootstrap.ts
import { resolveConfig } from "../shared/config";

export async function createAppContext(input: { workspaceRoot: string; dataDir: string }) {
  const config = resolveConfig(input);
  const kernel = { handleCommand: async () => undefined };
  return { config, kernel };
}
```

- [ ] **Step 5: Run the bootstrap test to verify it passes**

Run:

```bash
bun test tests/app/bootstrap.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the scaffold**

```bash
git add package.json bunfig.toml tsconfig.json .gitignore src/shared/config.ts src/app/bootstrap.ts src/app/main.ts tests/app/bootstrap.test.ts
git commit -m "chore: scaffold bun agent os workspace"
```

## Task 2: Define the Stable Domain Model and ID Helpers

**Files:**
- Create: `src/shared/ids.ts`
- Create: `src/shared/errors.ts`
- Create: `src/shared/schemas.ts`
- Create: `src/domain/thread.ts`
- Create: `src/domain/task.ts`
- Create: `src/domain/worker.ts`
- Create: `src/domain/event.ts`
- Create: `src/domain/approval.ts`
- Create: `src/domain/memory.ts`
- Create: `src/domain/tool-call.ts`
- Test: `tests/domain/thread.test.ts`
- Test: `tests/domain/task.test.ts`
- Test: `tests/domain/approval.test.ts`

- [ ] **Step 1: Write failing domain tests for state transitions**

```ts
import { describe, expect, test } from "bun:test";
import { createThread, transitionThread } from "../../src/domain/thread";

describe("thread transitions", () => {
  test("moves from active to waiting_approval", () => {
    const thread = createThread("thread_1");
    const next = transitionThread(thread, "waiting_approval");
    expect(next.status).toBe("waiting_approval");
  });
});
```

```ts
import { describe, expect, test } from "bun:test";
import { createTask, transitionTask } from "../../src/domain/task";

describe("task transitions", () => {
  test("blocks a running task", () => {
    const task = transitionTask(createTask("task_1", "thread_1"), "running");
    expect(transitionTask(task, "blocked").status).toBe("blocked");
  });
});
```

```ts
import { describe, expect, test } from "bun:test";
import { createApprovalRequest } from "../../src/domain/approval";

describe("approval requests", () => {
  test("start pending", () => {
    const approval = createApprovalRequest({
      approvalRequestId: "approval_1",
      threadId: "thread_1",
      taskId: "task_1",
      toolCallId: "tool_1",
      summary: "delete file",
      risk: "apply_patch.delete_file",
    });

    expect(approval.status).toBe("pending");
  });
});
```

- [ ] **Step 2: Run the domain tests to verify they fail**

Run:

```bash
bun test tests/domain/thread.test.ts tests/domain/task.test.ts tests/domain/approval.test.ts
```

Expected: FAIL because the domain modules do not exist.

- [ ] **Step 3: Implement minimal domain objects and transition guards**

```ts
// src/domain/thread.ts
export type ThreadStatus = "idle" | "active" | "waiting_approval" | "interrupted" | "completed" | "failed";

export function createThread(threadId: string) {
  return { threadId, status: "active" as ThreadStatus };
}

export function transitionThread(thread: { threadId: string; status: ThreadStatus }, status: ThreadStatus) {
  return { ...thread, status };
}
```

```ts
// src/domain/task.ts
export type TaskStatus = "queued" | "running" | "blocked" | "completed" | "failed" | "cancelled";

export function createTask(taskId: string, threadId: string) {
  return { taskId, threadId, status: "queued" as TaskStatus };
}

export function transitionTask(task: { status: TaskStatus }, status: TaskStatus) {
  return { ...task, status };
}
```

- [ ] **Step 4: Run the tests to verify the domain model passes**

Run:

```bash
bun test tests/domain/thread.test.ts tests/domain/task.test.ts tests/domain/approval.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the domain layer**

```bash
git add src/shared/ids.ts src/shared/errors.ts src/shared/schemas.ts src/domain/thread.ts src/domain/task.ts src/domain/worker.ts src/domain/event.ts src/domain/approval.ts src/domain/memory.ts src/domain/tool-call.ts tests/domain/thread.test.ts tests/domain/task.test.ts tests/domain/approval.test.ts
git commit -m "feat: add core agent domain model"
```

## Task 3: Implement SQLite Ports and Stores

**Files:**
- Create: `src/persistence/ports/storage-port.ts`
- Create: `src/persistence/ports/checkpoint-port.ts`
- Create: `src/persistence/ports/task-store-port.ts`
- Create: `src/persistence/ports/memory-store-port.ts`
- Create: `src/persistence/ports/event-log-port.ts`
- Create: `src/persistence/sqlite/sqlite-client.ts`
- Create: `src/persistence/sqlite/sqlite-migrator.ts`
- Create: `src/persistence/sqlite/sqlite-task-store.ts`
- Create: `src/persistence/sqlite/sqlite-memory-store.ts`
- Create: `src/persistence/sqlite/sqlite-event-log.ts`
- Create: `src/persistence/sqlite/sqlite-thread-store.ts`
- Create: `src/persistence/sqlite/sqlite-approval-store.ts`
- Create: `src/persistence/sqlite/sqlite-checkpointer.ts`
- Test: `tests/persistence/sqlite-task-store.test.ts`
- Test: `tests/persistence/sqlite-memory-store.test.ts`
- Test: `tests/persistence/sqlite-event-log.test.ts`

- [ ] **Step 1: Write failing SQLite store tests**

```ts
import { describe, expect, test } from "bun:test";
import { SqliteTaskStore } from "../../src/persistence/sqlite/sqlite-task-store";

describe("SqliteTaskStore", () => {
  test("persists and reloads tasks", async () => {
    const store = new SqliteTaskStore(":memory:");
    await store.save({ taskId: "task_1", threadId: "thread_1", status: "queued" });
    const task = await store.get("task_1");
    expect(task?.status).toBe("queued");
  });
});
```

```ts
import { describe, expect, test } from "bun:test";
import { SqliteMemoryStore } from "../../src/persistence/sqlite/sqlite-memory-store";

describe("SqliteMemoryStore", () => {
  test("scopes durable memory by namespace", async () => {
    const store = new SqliteMemoryStore(":memory:");
    await store.put(["project", "demo"], "decision_1", { kind: "decision", value: "Use Ink" });
    const results = await store.search(["project", "demo"], { query: "Ink", limit: 5 });
    expect(results).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the store tests to verify they fail**

Run:

```bash
bun test tests/persistence/sqlite-task-store.test.ts tests/persistence/sqlite-memory-store.test.ts tests/persistence/sqlite-event-log.test.ts
```

Expected: FAIL because the SQLite stores are missing.

- [ ] **Step 3: Implement the SQLite client, schema migration, and minimal stores**

```ts
// src/persistence/sqlite/sqlite-client.ts
import { Database } from "bun:sqlite";

export function createSqlite(path: string) {
  return new Database(path, { create: true });
}
```

```ts
// src/persistence/sqlite/sqlite-checkpointer.ts
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";

export function createSqliteCheckpointer(connString: string) {
  return SqliteSaver.fromConnString(connString);
}
```

- [ ] **Step 4: Run the store tests to verify the adapters pass**

Run:

```bash
bun test tests/persistence/sqlite-task-store.test.ts tests/persistence/sqlite-memory-store.test.ts tests/persistence/sqlite-event-log.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the persistence layer**

```bash
git add src/persistence/ports src/persistence/sqlite tests/persistence/sqlite-task-store.test.ts tests/persistence/sqlite-memory-store.test.ts tests/persistence/sqlite-event-log.test.ts
git commit -m "feat: add sqlite persistence adapters"
```

## Task 4: Build the Event Bus, Command Bus, and Session Kernel

**Files:**
- Create: `src/kernel/command-bus.ts`
- Create: `src/kernel/event-bus.ts`
- Create: `src/kernel/thread-service.ts`
- Create: `src/kernel/interrupt-service.ts`
- Create: `src/kernel/session-kernel.ts`
- Test: `tests/kernel/session-kernel.test.ts`

- [ ] **Step 1: Write a failing kernel test**

```ts
import { describe, expect, test } from "bun:test";
import { createSessionKernel } from "../../src/kernel/session-kernel";

describe("SessionKernel", () => {
  test("creates a thread and emits a thread.started event", async () => {
    const kernel = createSessionKernel({
      stores: {
        threadStore: {
          async createThread() {
            return { threadId: "thread_1" };
          },
        },
      },
      controlPlane: {
        async startRootTask() {
          return;
        },
      },
    });
    const events: string[] = [];
    kernel.events.subscribe((event) => events.push(event.type));

    await kernel.handleCommand({ type: "submit_input", payload: { text: "plan the repo" } });

    expect(events).toContain("thread.started");
  });
});
```

- [ ] **Step 2: Run the kernel test to verify it fails**

Run:

```bash
bun test tests/kernel/session-kernel.test.ts
```

Expected: FAIL because `createSessionKernel` is missing.

- [ ] **Step 3: Implement minimal buses and thread dispatch**

```ts
type EventHandler = (event: { type: string; payload?: unknown }) => void;

export function createEventBus() {
  const handlers = new Set<EventHandler>();
  return {
    publish(event: { type: string; payload?: unknown }) {
      handlers.forEach((handler) => handler(event));
    },
    subscribe(handler: EventHandler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
}
```

```ts
export function createSessionKernel(deps: {
  stores: { threadStore: { createThread: () => Promise<{ threadId: string }> } };
  controlPlane: { startRootTask: (threadId: string, text: string) => Promise<void> };
}) {
  const events = createEventBus();
  return {
    events,
    async handleCommand(command: { type: "submit_input"; payload: { text: string } }) {
      const thread = await deps.stores.threadStore.createThread();
      events.publish({ type: "thread.started", payload: thread });
      await deps.controlPlane.startRootTask(thread.threadId, command.payload.text);
    },
  };
}
```

- [ ] **Step 4: Run the kernel test to verify it passes**

Run:

```bash
bun test tests/kernel/session-kernel.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the kernel layer**

```bash
git add src/kernel tests/kernel/session-kernel.test.ts
git commit -m "feat: add session kernel and buses"
```

## Task 5: Implement the Policy Engine and Tool Registry

**Files:**
- Create: `src/control/policy/risk-model.ts`
- Create: `src/control/policy/policy-engine.ts`
- Create: `src/control/policy/approval-service.ts`
- Create: `src/control/tools/tool-types.ts`
- Create: `src/control/tools/tool-registry.ts`
- Create: `src/control/tools/executors/read-file.ts`
- Create: `src/control/tools/executors/apply-patch.ts`
- Create: `src/control/tools/executors/exec.ts`
- Test: `tests/control/policy-engine.test.ts`
- Test: `tests/control/tool-registry.test.ts`

- [ ] **Step 1: Write failing policy tests**

```ts
import { describe, expect, test } from "bun:test";
import { createPolicyEngine } from "../../src/control/policy/policy-engine";

describe("PolicyEngine", () => {
  test("approves ordinary source-file apply_patch edits automatically", () => {
    const policy = createPolicyEngine({ workspaceRoot: "/repo" });
    const decision = policy.evaluate({
      toolName: "apply_patch",
      effect: "apply_patch",
      action: "modify_file",
      path: "/repo/src/app/main.ts",
      changedFiles: 1,
    });

    expect(decision.kind).toBe("allow");
  });

  test("requires approval for delete_file", () => {
    const policy = createPolicyEngine({ workspaceRoot: "/repo" });
    const decision = policy.evaluate({
      toolName: "apply_patch",
      effect: "apply_patch",
      action: "delete_file",
      path: "/repo/src/app/main.ts",
      changedFiles: 1,
    });

    expect(decision.kind).toBe("needs_approval");
  });
});
```

- [ ] **Step 2: Run the policy tests to verify they fail**

Run:

```bash
bun test tests/control/policy-engine.test.ts tests/control/tool-registry.test.ts
```

Expected: FAIL because the policy engine and tool registry are missing.

- [ ] **Step 3: Implement minimal risk classification and gated tool execution**

```ts
// src/control/policy/policy-engine.ts
export function createPolicyEngine(input: { workspaceRoot: string }) {
  return {
    evaluate(request: {
      toolName: string;
      effect: "read" | "apply_patch" | "sensitive_write" | "exec";
      action?: "modify_file" | "create_file" | "delete_file";
      path?: string;
      changedFiles?: number;
    }) {
      if (request.effect === "apply_patch" && request.action === "delete_file") {
        return { kind: "needs_approval", reason: "delete_file requires approval" } as const;
      }

      if (request.effect === "apply_patch" && request.path?.startsWith(input.workspaceRoot)) {
        return { kind: "allow", reason: "safe workspace patch" } as const;
      }

      return { kind: "deny", reason: "unsupported tool request" } as const;
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify policy and tool registry pass**

Run:

```bash
bun test tests/control/policy-engine.test.ts tests/control/tool-registry.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the policy layer**

```bash
git add src/control/policy src/control/tools tests/control/policy-engine.test.ts tests/control/tool-registry.test.ts
git commit -m "feat: add tool policy and approval flow"
```

## Task 6: Implement Task and Worker Management

**Files:**
- Create: `src/control/tasks/task-types.ts`
- Create: `src/control/tasks/task-manager.ts`
- Create: `src/control/workers/worker-types.ts`
- Create: `src/control/workers/worker-runtime.ts`
- Create: `src/control/workers/worker-manager.ts`
- Test: `tests/control/task-manager.test.ts`
- Test: `tests/control/worker-manager.test.ts`

- [ ] **Step 1: Write failing task and worker manager tests**

```ts
import { describe, expect, test } from "bun:test";
import { createTaskManager } from "../../src/control/tasks/task-manager";

describe("TaskManager", () => {
  test("creates a root task in queued state", async () => {
    const manager = createTaskManager({
      taskStore: {
        async save() {
          return;
        },
      },
      eventLog: {
        async append() {
          return;
        },
      },
    });
    const task = await manager.createRootTask("thread_1", "plan repo");
    expect(task.status).toBe("queued");
  });
});
```

```ts
import { describe, expect, test } from "bun:test";
import { createWorkerManager } from "../../src/control/workers/worker-manager";

describe("WorkerManager", () => {
  test("spawns an executor worker for a task", async () => {
    const manager = createWorkerManager({
      runtimeFactory() {
        return {
          async start() {
            return;
          },
        };
      },
    });
    const worker = await manager.spawn({
      role: "executor",
      taskId: "task_1",
      threadId: "thread_1",
      spawnReason: "execute patch",
    });
    expect(worker.role).toBe("executor");
  });
});
```

- [ ] **Step 2: Run the manager tests to verify they fail**

Run:

```bash
bun test tests/control/task-manager.test.ts tests/control/worker-manager.test.ts
```

Expected: FAIL because the managers do not exist.

- [ ] **Step 3: Implement minimal managers and worker contracts**

```ts
export function createTaskManager(deps: {
  taskStore: { save: (task: { taskId: string; threadId: string; status: string }) => Promise<void> };
}) {
  return {
    async createRootTask(threadId: string, summary: string) {
      const task = { taskId: `task_${Date.now()}`, threadId, summary, status: "queued" };
      await deps.taskStore.save(task);
      return task;
    },
  };
}
```

```ts
export function createWorkerManager(deps: {
  runtimeFactory: (input: { role: string }) => { start: () => Promise<void> };
}) {
  return {
    async spawn(input: { role: "planner" | "executor" | "verifier" | "memory_maintainer"; taskId: string; threadId: string; spawnReason: string }) {
      const runtime = deps.runtimeFactory({ role: input.role });
      await runtime.start();
      return { workerId: `worker_${Date.now()}`, ...input, status: "running" as const };
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify the managers pass**

Run:

```bash
bun test tests/control/task-manager.test.ts tests/control/worker-manager.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit task and worker control**

```bash
git add src/control/tasks src/control/workers tests/control/task-manager.test.ts tests/control/worker-manager.test.ts
git commit -m "feat: add task and worker control plane"
```

## Task 7: Implement the LangGraph Root Runtime and Worker Graphs

**Files:**
- Create: `src/runtime/graph/root/state.ts`
- Create: `src/runtime/graph/root/context.ts`
- Create: `src/runtime/graph/root/graph.ts`
- Create: `src/runtime/graph/root/nodes/intake.ts`
- Create: `src/runtime/graph/root/nodes/route.ts`
- Create: `src/runtime/graph/root/nodes/post-turn-guard.ts`
- Create: `src/runtime/workers/planner/graph.ts`
- Create: `src/runtime/workers/executor/graph.ts`
- Create: `src/runtime/workers/verifier/graph.ts`
- Create: `src/runtime/workers/memory-maintainer/graph.ts`
- Test: `tests/runtime/root-graph.test.ts`
- Test: `tests/runtime/interrupt-resume.test.ts`

- [ ] **Step 1: Write failing runtime tests**

```ts
import { describe, expect, test } from "bun:test";
import { createRootGraph } from "../../src/runtime/graph/root/graph";

describe("root graph", () => {
  test("routes plan work into the planner worker", async () => {
    const graph = await createRootGraph({
      planner: async () => ({ summary: "planned", mode: "plan" }),
      executor: async () => ({ summary: "executed", mode: "execute" }),
      verifier: async () => ({ summary: "verified", mode: "verify" }),
    });
    const result = await graph.invoke(
      { input: "plan the repository" },
      { configurable: { thread_id: "thread_1" } },
    );

    expect(result.mode).toBe("plan");
  });
});
```

- [ ] **Step 2: Run the runtime tests to verify they fail**

Run:

```bash
bun test tests/runtime/root-graph.test.ts tests/runtime/interrupt-resume.test.ts
```

Expected: FAIL because the runtime graphs are missing.

- [ ] **Step 3: Implement minimal root state, context, and routing**

```ts
// src/runtime/graph/root/state.ts
import { MessagesAnnotation, StateGraphAnnotation } from "@langchain/langgraph";
import * as z from "zod/v4";

export const RootState = StateGraphAnnotation.Root({
  input: StateGraphAnnotation<string>(),
  mode: StateGraphAnnotation<"plan" | "execute" | "verify" | "done">(),
  summary: StateGraphAnnotation<string>(),
  messages: MessagesAnnotation,
});
```

```ts
// src/runtime/graph/root/nodes/route.ts
export function routeNode(state: { input: string }) {
  if (state.input.includes("verify")) return { mode: "verify" as const };
  if (state.input.includes("plan")) return { mode: "plan" as const };
  return { mode: "execute" as const };
}
```

- [ ] **Step 4: Run the runtime tests to verify graph execution passes**

Run:

```bash
bun test tests/runtime/root-graph.test.ts tests/runtime/interrupt-resume.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the graph runtime**

```bash
git add src/runtime tests/runtime/root-graph.test.ts tests/runtime/interrupt-resume.test.ts
git commit -m "feat: add langgraph root runtime and worker graphs"
```

## Task 8: Build the TUI Shell and Answer Pane

**Files:**
- Create: `src/interface/tui/app.tsx`
- Create: `src/interface/tui/screen.tsx`
- Create: `src/interface/tui/commands.ts`
- Create: `src/interface/tui/hooks/use-kernel.ts`
- Create: `src/interface/tui/components/composer.tsx`
- Create: `src/interface/tui/components/event-stream.tsx`
- Create: `src/interface/tui/components/task-panel.tsx`
- Create: `src/interface/tui/components/approval-panel.tsx`
- Create: `src/interface/tui/components/answer-pane.tsx`
- Test: `tests/interface/tui-app.test.tsx`
- Test: `tests/interface/answer-pane.test.tsx`

- [ ] **Step 1: Write failing TUI tests**

```tsx
import React from "react";
import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { App } from "../../src/interface/tui/app";

describe("TUI App", () => {
  test("renders the core task shell regions", () => {
    const kernel = {
      events: {
        subscribe() {
          return () => undefined;
        },
      },
      async handleCommand() {
        return { status: "completed" };
      },
    };
    const { lastFrame } = render(<App kernel={kernel} />);
    const frame = lastFrame();

    expect(frame).toContain("Composer");
    expect(frame).toContain("Events");
    expect(frame).toContain("Tasks");
    expect(frame).toContain("Answer");
  });
});
```

```tsx
import React from "react";
import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { AnswerPane } from "../../src/interface/tui/components/answer-pane";

describe("AnswerPane", () => {
  test("shows changed files and line deltas", () => {
    const { lastFrame } = render(
      <AnswerPane
        summary="Updated planner routing"
        changes={[{ path: "src/runtime/graph/root/graph.ts", additions: 24, deletions: 8 }]}
        verification={["bun test tests/runtime/root-graph.test.ts PASS"]}
      />,
    );

    const frame = lastFrame();
    expect(frame).toContain("graph.ts");
    expect(frame).toContain("+24");
    expect(frame).toContain("-8");
  });
});
```

- [ ] **Step 2: Run the TUI tests to verify they fail**

Run:

```bash
bun test tests/interface/tui-app.test.tsx tests/interface/answer-pane.test.tsx
```

Expected: FAIL because the TUI components are missing.

- [ ] **Step 3: Implement the minimal task-shell UI**

```tsx
// src/interface/tui/components/answer-pane.tsx
import React from "react";
import { Box, Text } from "ink";

export function AnswerPane(input: {
  summary: string;
  changes: Array<{ path: string; additions: number; deletions: number }>;
  verification: string[];
}) {
  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text>Answer</Text>
      <Text>{input.summary}</Text>
      {input.changes.map((change) => (
        <Text key={change.path}>
          {change.path} +{change.additions} -{change.deletions}
        </Text>
      ))}
      {input.verification.map((line) => (
        <Text key={line}>{line}</Text>
      ))}
    </Box>
  );
}
```

- [ ] **Step 4: Run the TUI tests to verify they pass**

Run:

```bash
bun test tests/interface/tui-app.test.tsx tests/interface/answer-pane.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the TUI shell**

```bash
git add src/interface/tui tests/interface/tui-app.test.tsx tests/interface/answer-pane.test.tsx
git commit -m "feat: add task shell tui"
```

## Task 9: Wire the Full System and Add End-to-End Checks

**Files:**
- Modify: `src/app/bootstrap.ts`
- Modify: `src/app/main.ts`
- Modify: `src/kernel/session-kernel.ts`
- Modify: `src/control/tools/tool-registry.ts`
- Modify: `src/runtime/graph/root/graph.ts`
- Modify: `src/interface/tui/app.tsx`
- Test: `tests/runtime/interrupt-resume.test.ts`
- Test: `tests/interface/tui-app.test.tsx`

- [ ] **Step 1: Write a failing end-to-end interrupt/approval test**

```ts
import { describe, expect, test } from "bun:test";
import { createAppContext } from "../../src/app/bootstrap";

describe("approval flow", () => {
  test("blocks delete_file patches until approved", async () => {
    const ctx = await createAppContext({
      workspaceRoot: "/tmp/repo",
      dataDir: ":memory:",
    });

    const result = await ctx.kernel.handleCommand({
      type: "submit_input",
      payload: { text: "delete src/old.ts" },
    });

    expect(result.status).toBe("waiting_approval");
  });
});
```

- [ ] **Step 2: Run the end-to-end checks to verify they fail**

Run:

```bash
bun test tests/runtime/interrupt-resume.test.ts tests/interface/tui-app.test.tsx
```

Expected: FAIL because the system is not fully wired yet.

- [ ] **Step 3: Integrate bootstrap, kernel, stores, runtime, and TUI**

```ts
// src/app/bootstrap.ts
export async function createAppContext(input: { workspaceRoot: string; dataDir: string }) {
  const config = resolveConfig(input);
  const sqlite = createSqlite(config.dataDir);
  await migrate(sqlite);

  const stores = createStores(sqlite);
  const checkpointer = createSqliteCheckpointer(config.checkpointConnString);
  const controlPlane = await createControlPlane({ config, stores, checkpointer });
  const kernel = createSessionKernel({ stores, controlPlane });

  return { config, stores, controlPlane, kernel };
}
```

- [ ] **Step 4: Run the targeted integration checks**

Run:

```bash
bun test tests/runtime/interrupt-resume.test.ts tests/interface/tui-app.test.tsx
bun test
```

Expected:

- approval flow passes
- TUI shell tests pass
- full test suite passes

- [ ] **Step 5: Commit the fully wired V1**

```bash
git add src tests
git commit -m "feat: wire agent os v1 runtime"
```

## Task 10: Final Verification and Developer UX Cleanup

**Files:**
- Modify: `README.md`
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Write a failing smoke check by codifying developer commands**

Add a `test`, `dev`, and `typecheck` script to `package.json` and a smoke section to `README.md`.

- [ ] **Step 2: Run the developer commands before editing**

Run:

```bash
bun test
bun run typecheck
```

Expected: one or more commands fail because the scripts do not exist yet.

- [ ] **Step 3: Add developer scripts and startup docs**

Required scripts:

```json
{
  "scripts": {
    "dev": "bun run src/app/main.ts",
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  }
}
```

README sections:

- install
- run TUI
- run tests
- where SQLite data lives
- how approvals work

- [ ] **Step 4: Run final verification**

Run:

```bash
bun test
bun run typecheck
bun run src/app/main.ts --help
```

Expected:

- tests pass
- typecheck passes
- app prints usage or starts the shell cleanly

- [ ] **Step 5: Commit the verification pass**

```bash
git add README.md package.json .gitignore
git commit -m "chore: document and verify agent os v1"
```

## Implementation Notes

- Use `@langchain/langgraph-checkpoint-sqlite` for checkpoint persistence rather than inventing a custom checkpointer.
- Use `bun:sqlite` for application stores and migrations to keep the V1 local runtime simple.
- Keep LangGraph state narrow: input, mode, message context, and execution-local fields only.
- Do not let TUI components talk to stores directly.
- Do not bypass the tool registry from graph nodes or worker runtimes.
- Keep durable memory writes in the post-turn path or explicit user commands only.

## Plan Review

Manual review against the spec is required in this environment because delegated reviewer subagents are not available in this session.

Review checklist:

- no placeholder tasks
- every major spec section maps to at least one task
- no task bypasses policy, worker lifecycle, or memory boundaries
- build order allows each layer to compile and be tested incrementally
