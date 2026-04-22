# LangGraph v2 Agent Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace OpenPX custom agent runtime semantics with a LangGraph `StateGraph` runtime backed directly by SQLite checkpoint and store.

**Architecture:** Build a new `src/harness/graph/` runtime first, wire it into harness session/protocol as the only agent execution path, then remove old run-loop, continuation, AgentRun, and custom memory semantics. OpenPX remains the local Agent OS shell: it owns workspace/session/protocol/surface/tool permission UI, while LangGraph owns agent state, checkpoint recovery, interrupts, streaming, short-term memory, long-term memory, and subgraphs.

**Tech Stack:** Bun, TypeScript strict mode, Zod v4, LangGraph JS `@langchain/langgraph`, LangGraph store base types `@langchain/langgraph-checkpoint`, LangGraph SQLite checkpointer `@langchain/langgraph-checkpoint-sqlite`, Bun SQLite, React Ink.

---

## External References

- LangGraph JS memory and store: https://docs.langchain.com/oss/javascript/langgraph/add-memory
- LangGraph JS interrupts: https://docs.langchain.com/oss/javascript/langgraph/interrupts
- LangGraph JS streaming: https://docs.langchain.com/oss/javascript/langgraph/streaming
- LangGraph JS subgraphs: https://docs.langchain.com/oss/javascript/langgraph/use-subgraphs
- SQLite checkpointer reference: https://reference.langchain.com/javascript/langchain-langgraph-checkpoint-sqlite

## Scope Check

The accepted spec intentionally covers a full runtime cutover. This plan keeps it as one implementation stream because the subsystems are not independent: protocol shape, session commands, SQLite persistence, interrupt UI, and graph runtime must agree on the same LangGraph state model. Each task below leaves the repository in a testable state and ends with a commit.

## File Structure Map

- Create `src/harness/graph/state.ts`
  Defines OpenPX graph state schema and projection-friendly TypeScript types.
- Create `src/harness/graph/interrupts.ts`
  Defines JSON-serializable LangGraph interrupt payloads and resume values.
- Create `src/harness/graph/events.ts`
  Defines graph runtime event names used by protocol and surface projections.
- Create `src/harness/graph/root-graph.ts`
  Builds and compiles the root `StateGraph`.
- Create `src/harness/graph/runtime.ts`
  Wraps graph invoke, stream, resume, cancel, and state reads behind an OpenPX-facing runtime interface.
- Create `src/harness/graph/checkpoint/sqlite-checkpoint.ts`
  Creates the LangGraph SQLite checkpointer from the OpenPX data path.
- Create `src/harness/graph/store/sqlite-store.ts`
  Creates the LangGraph-compatible SQLite store by implementing LangGraph `BaseStore` directly over SQLite. This is a LangGraph store backend, not an OpenPX memory abstraction.
- Create `src/harness/graph/streaming/stream-adapter.ts`
  Maps LangGraph stream chunks to OpenPX protocol events.
- Create `src/harness/graph/tools/approval-tool-wrapper.ts`
  Runs OpenPX risk policy before side-effect tools and calls LangGraph `interrupt()` when user confirmation is required.
- Create `tests/harness/graph/*.test.ts`
  Tests graph dependencies, state schemas, checkpoint persistence, interrupt/resume, store-backed memory, streaming adapter, and tool approval.
- Modify `package.json` and `bun.lock`
  Adds LangGraph runtime dependencies.
- Modify `src/app/bootstrap.ts`
  Replaces run-loop control plane assembly with graph runtime assembly.
- Modify `src/harness/core/session/session-kernel.ts`
  Replaces approval/recovery/plan-decision commands with graph invocation and `resume_interrupt`.
- Modify `src/harness/protocol/commands/runtime-command-schema.ts`
  Replaces v1 commands with graph-native commands.
- Modify `src/harness/protocol/events/runtime-event-schema.ts`
  Replaces loop/agent-run/recovery events with graph/interrupt/tool/message events.
- Modify `src/harness/protocol/views/runtime-snapshot-schema.ts`
  Replaces v1 run-loop projection fields with graph projection fields.
- Modify `src/harness/protocol/views/runtime-snapshot-builder.ts`
  Builds graph-native snapshots.
- Modify `src/harness/server/http/runtime-router.ts`
  Routes new protocol commands to the session kernel.
- Modify `src/surfaces/tui/*`
  Renames approval/AgentRun panels into interrupt and graph activity views.
- Modify `src/persistence/sqlite/sqlite-migrator.ts`
  Removes creation of old run-loop and custom memory tables; keeps product shell tables.
- Delete `src/harness/core/run-loop/`
  Removes v1 run-loop implementation.
- Delete `src/persistence/ports/run-state-store.ts`
  Removes custom run-loop recovery store.
- Delete `src/persistence/sqlite/sqlite-run-state-store.ts`
  Removes custom run-loop SQLite store.
- Delete `src/domain/agent-run.ts` and `src/control/agent-runs/`
  Removes custom AgentRun lifecycle system after protocol/surface no longer imports it.
- Delete `src/domain/memory.ts`, `src/persistence/ports/memory-store-port.ts`, `src/persistence/sqlite/sqlite-memory-store.ts`, and `src/control/context/memory-consolidator.ts`
  Removes OpenPX custom memory truth after LangGraph store projection is wired.
- Modify `CONTROL.md`, `ARCHITECTURE.md`, `ROADMAP.md`, and selected `docs/space/*`
  Updates root control and knowledge-space documents to the LangGraph v2 truth model.

---

### Task 1: Add LangGraph Dependencies

**Files:**
- Modify: `package.json`
- Modify: `bun.lock`
- Create: `tests/harness/graph/dependency-smoke.test.ts`

- [ ] **Step 1: Write the failing dependency smoke test**

Create `tests/harness/graph/dependency-smoke.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { Command, END, START, StateGraph, StateSchema, interrupt } from "@langchain/langgraph";
import { BaseStore } from "@langchain/langgraph-checkpoint";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { z } from "zod/v4";

const DependencySmokeState = new StateSchema({
  input: z.string(),
  approved: z.boolean().optional(),
});

describe("LangGraph dependency smoke test", () => {
  test("compiles a minimal StateGraph and exposes SQLite checkpoint primitives", async () => {
    const graph = new StateGraph(DependencySmokeState)
      .addNode("approval", (state) => {
        const approved = interrupt({
          kind: "approval",
          summary: `Approve ${state.input}`,
        }) as boolean;
        return { approved };
      })
      .addEdge(START, "approval")
      .addEdge("approval", END)
      .compile({ checkpointer: SqliteSaver.fromConnString(":memory:") });

    const config = { configurable: { thread_id: "dependency-smoke" } };
    const interrupted = await graph.invoke({ input: "smoke" }, config);

    expect(interrupted).toHaveProperty("__interrupt__");
    expect(BaseStore).toBeTypeOf("function");
    expect(SqliteSaver.fromConnString).toBeTypeOf("function");
    expect(new Command({ resume: true })).toBeInstanceOf(Command);
  });
});
```

- [ ] **Step 2: Run test to verify it fails because dependencies are missing**

Run:

```bash
bun test tests/harness/graph/dependency-smoke.test.ts
```

Expected: FAIL with a module resolution error for `@langchain/langgraph`, `@langchain/langgraph-checkpoint`, or `@langchain/langgraph-checkpoint-sqlite`.

- [ ] **Step 3: Install LangGraph packages**

Run:

```bash
bun add @langchain/langgraph@latest @langchain/langgraph-checkpoint@latest @langchain/langgraph-checkpoint-sqlite@latest
```

Expected: `package.json` gains both dependencies and `bun.lock` is updated.

- [ ] **Step 4: Run the dependency smoke test**

Run:

```bash
bun test tests/harness/graph/dependency-smoke.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock tests/harness/graph/dependency-smoke.test.ts
git commit -m "chore: add langgraph runtime dependencies"
```

---

### Task 2: Define Graph State, Interrupt, and Event Contracts

**Files:**
- Create: `src/harness/graph/state.ts`
- Create: `src/harness/graph/interrupts.ts`
- Create: `src/harness/graph/events.ts`
- Create: `src/harness/graph/index.ts`
- Create: `tests/harness/graph/state-contract.test.ts`

- [ ] **Step 1: Write graph contract tests**

Create `tests/harness/graph/state-contract.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  graphActivitySchema,
  graphStatusSchema,
  openPXGraphProjectionSchema,
  openPXGraphStateProjectionSchema,
} from "../../src/harness/graph/state";
import {
  approvalInterruptPayloadSchema,
  graphInterruptPayloadSchema,
  graphResumeValueSchema,
} from "../../src/harness/graph/interrupts";
import { graphRuntimeEventSchema } from "../../src/harness/graph/events";

describe("OpenPX graph contracts", () => {
  test("accepts projection-safe graph state", () => {
    const parsed = openPXGraphStateProjectionSchema.parse({
      messages: [
        { role: "user", content: "请读取项目结构" },
        { role: "assistant", content: "我会先读取控制文档。" },
      ],
      workspace: {
        workspaceRoot: "/tmp/openpx",
        projectId: "openpx",
        cwd: "/tmp/openpx",
      },
      intent: {
        kind: "code",
        summary: "读取项目结构",
      },
      plan: {
        summary: "读取文档后规划",
        steps: ["读取 AGENTS.md", "读取 CONTROL.md"],
      },
      workingContext: {
        files: ["AGENTS.md", "CONTROL.md"],
        facts: ["harness 是系统本体"],
        constraints: ["不能使用 any"],
      },
      toolResults: [
        {
          toolCallId: "tool-1",
          toolName: "read_file",
          summary: "读取 AGENTS.md",
          success: true,
        },
      ],
      response: {
        content: "已完成读取。",
      },
      metadata: {
        activeNode: "respond",
        checkpointId: "checkpoint-1",
      },
    });

    expect(parsed.workspace?.projectId).toBe("openpx");
    expect(parsed.plan?.steps).toContain("读取 CONTROL.md");
  });

  test("accepts approval interrupt and resume values", () => {
    const approval = approvalInterruptPayloadSchema.parse({
      kind: "approval",
      requestId: "approval-1",
      toolName: "apply_patch",
      summary: "删除 src/legacy.ts",
      risk: "high",
      argsPreview: { path: "src/legacy.ts" },
      cwd: "/tmp/openpx",
      affectedPaths: ["src/legacy.ts"],
      recommendedDecision: "rejected",
      resumeSchema: "approval-v1",
    });

    expect(graphInterruptPayloadSchema.parse(approval).kind).toBe("approval");
    expect(
      graphResumeValueSchema.parse({
        requestId: "approval-1",
        decision: "approved",
        reason: "用户确认删除",
      }).decision,
    ).toBe("approved");
  });

  test("accepts graph runtime events", () => {
    expect(
      graphRuntimeEventSchema.parse({
        type: "graph.interrupted",
        payload: {
          threadId: "thread-1",
          interrupt: {
            kind: "clarification",
            requestId: "clarify-1",
            question: "目标文件是哪一个？",
          },
        },
      }).type,
    ).toBe("graph.interrupted");
  });

  test("accepts graph activity projection", () => {
    expect(graphStatusSchema.parse("running")).toBe("running");
    expect(
      graphActivitySchema.parse({
        id: "activity-1",
        label: "Explore",
        status: "running",
        node: "explore",
      }).label,
    ).toBe("Explore");
    expect(
      openPXGraphProjectionSchema.parse({
        status: "interrupted",
        activeNode: "execute",
        checkpointId: "checkpoint-1",
        lastCheckpointAt: "2026-04-23T00:00:00.000Z",
        pendingInterrupt: {
          kind: "approval",
          requestId: "approval-1",
          toolName: "apply_patch",
          summary: "修改 README.md",
          risk: "medium",
          argsPreview: { path: "README.md" },
          cwd: "/tmp/openpx",
          affectedPaths: ["README.md"],
          recommendedDecision: "approved",
          resumeSchema: "approval-v1",
        },
      }).status,
    ).toBe("interrupted");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun test tests/harness/graph/state-contract.test.ts
```

Expected: FAIL because `src/harness/graph/state.ts`, `interrupts.ts`, and `events.ts` do not exist.

- [ ] **Step 3: Add interrupt contracts**

Create `src/harness/graph/interrupts.ts`:

```ts
import { z } from "zod";

const jsonRecordSchema: z.ZodType<Record<string, unknown>> = z.record(z.string(), z.unknown());

export const approvalInterruptPayloadSchema = z.object({
  kind: z.literal("approval"),
  requestId: z.string().min(1),
  toolName: z.string().min(1),
  summary: z.string().min(1),
  risk: z.enum(["low", "medium", "high"]),
  argsPreview: jsonRecordSchema,
  cwd: z.string().min(1),
  affectedPaths: z.array(z.string().min(1)),
  recommendedDecision: z.enum(["approved", "rejected"]),
  resumeSchema: z.literal("approval-v1"),
}).strict();

export const planDecisionInterruptPayloadSchema = z.object({
  kind: z.literal("plan_decision"),
  requestId: z.string().min(1),
  question: z.string().min(1),
  options: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    description: z.string().min(1),
    continuationInput: z.string().min(1),
  }).strict()).min(2),
}).strict();

export const clarificationInterruptPayloadSchema = z.object({
  kind: z.literal("clarification"),
  requestId: z.string().min(1),
  question: z.string().min(1),
  context: z.string().optional(),
}).strict();

export const credentialInterruptPayloadSchema = z.object({
  kind: z.literal("credential"),
  requestId: z.string().min(1),
  provider: z.string().min(1),
  reason: z.string().min(1),
}).strict();

export const externalBlockInterruptPayloadSchema = z.object({
  kind: z.literal("external_block"),
  requestId: z.string().min(1),
  summary: z.string().min(1),
  recoveryHint: z.string().min(1),
}).strict();

export const graphInterruptPayloadSchema = z.discriminatedUnion("kind", [
  approvalInterruptPayloadSchema,
  planDecisionInterruptPayloadSchema,
  clarificationInterruptPayloadSchema,
  credentialInterruptPayloadSchema,
  externalBlockInterruptPayloadSchema,
]);

export const graphResumeValueSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(["approved", "rejected"]).optional(),
  answer: z.string().optional(),
  reason: z.string().optional(),
  editedArgs: jsonRecordSchema.optional(),
}).strict();

export type ApprovalInterruptPayload = z.infer<typeof approvalInterruptPayloadSchema>;
export type GraphInterruptPayload = z.infer<typeof graphInterruptPayloadSchema>;
export type GraphResumeValue = z.infer<typeof graphResumeValueSchema>;
```

- [ ] **Step 4: Add graph state projection contracts**

Create `src/harness/graph/state.ts`:

```ts
import { z } from "zod";
import { graphInterruptPayloadSchema } from "./interrupts";

export const graphStatusSchema = z.enum(["idle", "running", "interrupted", "completed", "failed", "cancelled"]);

export const graphMessageProjectionSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string(),
  name: z.string().optional(),
}).strict();

export const graphWorkspaceSchema = z.object({
  workspaceRoot: z.string().min(1),
  projectId: z.string().min(1),
  cwd: z.string().min(1),
}).strict();

export const graphIntentSchema = z.object({
  kind: z.enum(["chat", "code", "plan", "verify", "review", "memory"]),
  summary: z.string().min(1),
}).strict();

export const graphPlanSchema = z.object({
  summary: z.string().min(1),
  steps: z.array(z.string().min(1)),
}).strict();

export const graphWorkingContextSchema = z.object({
  files: z.array(z.string().min(1)),
  facts: z.array(z.string().min(1)),
  constraints: z.array(z.string().min(1)),
}).strict();

export const graphToolResultSchema = z.object({
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  summary: z.string().min(1),
  success: z.boolean(),
  result: z.unknown().optional(),
}).strict();

export const graphResponseSchema = z.object({
  content: z.string(),
}).strict();

export const graphMetadataSchema = z.object({
  activeNode: z.string().min(1).optional(),
  checkpointId: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  costUsd: z.number().nonnegative().optional(),
  latencyMs: z.number().nonnegative().optional(),
}).strict();

export const openPXGraphStateProjectionSchema = z.object({
  messages: z.array(graphMessageProjectionSchema),
  workspace: graphWorkspaceSchema.optional(),
  intent: graphIntentSchema.optional(),
  plan: graphPlanSchema.optional(),
  workingContext: graphWorkingContextSchema.optional(),
  toolResults: z.array(graphToolResultSchema).optional(),
  interrupt: graphInterruptPayloadSchema.optional(),
  response: graphResponseSchema.optional(),
  metadata: graphMetadataSchema.optional(),
}).strict();

export const graphActivitySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  status: graphStatusSchema,
  node: z.string().min(1).optional(),
  summary: z.string().optional(),
}).strict();

export const openPXGraphProjectionSchema = z.object({
  status: graphStatusSchema,
  activeNode: z.string().min(1).optional(),
  checkpointId: z.string().min(1).optional(),
  lastCheckpointAt: z.string().optional(),
  pendingInterrupt: graphInterruptPayloadSchema.optional(),
}).strict();

export type GraphStatus = z.infer<typeof graphStatusSchema>;
export type OpenPXGraphStateProjection = z.infer<typeof openPXGraphStateProjectionSchema>;
export type OpenPXGraphProjection = z.infer<typeof openPXGraphProjectionSchema>;
export type GraphActivity = z.infer<typeof graphActivitySchema>;
```

- [ ] **Step 5: Add graph runtime event contracts**

Create `src/harness/graph/events.ts`:

```ts
import { z } from "zod";
import { graphInterruptPayloadSchema } from "./interrupts";
import { graphStatusSchema } from "./state";

export const graphRuntimeEventTypeSchema = z.enum([
  "graph.started",
  "graph.node_updated",
  "graph.interrupted",
  "graph.resumed",
  "graph.checkpoint_saved",
  "graph.completed",
  "graph.failed",
  "message.delta",
  "tool.started",
  "tool.completed",
  "tool.failed",
]);

const graphBasePayloadSchema = z.object({
  threadId: z.string().min(1),
  runId: z.string().min(1).optional(),
  checkpointId: z.string().min(1).optional(),
  node: z.string().min(1).optional(),
}).strict();

export const graphRuntimeEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("graph.started"),
    payload: graphBasePayloadSchema.extend({ status: graphStatusSchema }),
  }).strict(),
  z.object({
    type: z.literal("graph.node_updated"),
    payload: graphBasePayloadSchema.extend({ update: z.record(z.string(), z.unknown()) }),
  }).strict(),
  z.object({
    type: z.literal("graph.interrupted"),
    payload: graphBasePayloadSchema.extend({ interrupt: graphInterruptPayloadSchema }),
  }).strict(),
  z.object({
    type: z.literal("graph.resumed"),
    payload: graphBasePayloadSchema.extend({ requestId: z.string().min(1) }),
  }).strict(),
  z.object({
    type: z.literal("graph.checkpoint_saved"),
    payload: graphBasePayloadSchema.extend({ checkpointId: z.string().min(1) }),
  }).strict(),
  z.object({
    type: z.literal("graph.completed"),
    payload: graphBasePayloadSchema.extend({ status: z.literal("completed") }),
  }).strict(),
  z.object({
    type: z.literal("graph.failed"),
    payload: graphBasePayloadSchema.extend({ error: z.string().min(1) }),
  }).strict(),
  z.object({
    type: z.literal("message.delta"),
    payload: graphBasePayloadSchema.extend({ content: z.string(), index: z.number().int().nonnegative() }),
  }).strict(),
  z.object({
    type: z.literal("tool.started"),
    payload: graphBasePayloadSchema.extend({ toolCallId: z.string().min(1), toolName: z.string().min(1) }),
  }).strict(),
  z.object({
    type: z.literal("tool.completed"),
    payload: graphBasePayloadSchema.extend({ toolCallId: z.string().min(1), toolName: z.string().min(1), result: z.unknown().optional() }),
  }).strict(),
  z.object({
    type: z.literal("tool.failed"),
    payload: graphBasePayloadSchema.extend({ toolCallId: z.string().min(1), toolName: z.string().min(1), error: z.string().min(1) }),
  }).strict(),
]);

export type GraphRuntimeEvent = z.infer<typeof graphRuntimeEventSchema>;
```

- [ ] **Step 6: Add graph barrel export**

Create `src/harness/graph/index.ts`:

```ts
export * from "./events";
export * from "./interrupts";
export * from "./state";
```

- [ ] **Step 7: Run graph contract tests**

Run:

```bash
bun test tests/harness/graph/state-contract.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/harness/graph tests/harness/graph/state-contract.test.ts
git commit -m "feat: define graph runtime contracts"
```

---

### Task 3: Build Minimal Root Graph Runtime with SQLite Checkpoints

**Files:**
- Create: `src/harness/graph/checkpoint/sqlite-checkpoint.ts`
- Create: `src/harness/graph/store/sqlite-store.ts`
- Create: `src/harness/graph/root-graph.ts`
- Create: `src/harness/graph/runtime.ts`
- Modify: `src/harness/graph/index.ts`
- Create: `tests/harness/graph/runtime.test.ts`

- [ ] **Step 1: Write graph runtime tests**

Create `tests/harness/graph/runtime.test.ts`:

```ts
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { createSqliteStore } from "../../src/harness/graph/store/sqlite-store";
import { createOpenPXGraphRuntime } from "../../src/harness/graph/runtime";

async function createRuntime() {
  const dir = await mkdtemp(join(tmpdir(), "openpx-graph-"));
  return createOpenPXGraphRuntime({
    sqlitePath: join(dir, "openpx.sqlite"),
  });
}

describe("OpenPX graph runtime", () => {
  test("invokes the root graph and returns a graph projection", async () => {
    const runtime = await createRuntime();
    const result = await runtime.submitInput({
      threadId: "thread-runtime-1",
      workspaceRoot: "/workspace",
      projectId: "project-1",
      cwd: "/workspace",
      input: "hello",
    });

    expect(result.graph.status).toBe("completed");
    expect(result.state.response?.content).toContain("hello");
    expect(result.state.workspace?.projectId).toBe("project-1");
  });

  test("persists checkpoint state for a thread", async () => {
    const runtime = await createRuntime();
    await runtime.submitInput({
      threadId: "thread-runtime-2",
      workspaceRoot: "/workspace",
      projectId: "project-1",
      cwd: "/workspace",
      input: "remember this invocation",
    });

    const snapshot = await runtime.getThreadState({ threadId: "thread-runtime-2" });

    expect(snapshot.graph.checkpointId).toBeString();
    expect(snapshot.state.messages.at(-1)?.content).toContain("remember this invocation");
  });

  test("stores long-term memory in SQLite through the LangGraph store interface", async () => {
    const dir = await mkdtemp(join(tmpdir(), "openpx-graph-store-"));
    const sqlitePath = join(dir, "openpx.sqlite");
    const store = await createSqliteStore({ sqlitePath });

    await store.put(["project", "memories"], "memory-1", {
      data: "OpenPX uses LangGraph checkpoint as runtime truth.",
      type: "architecture",
    });

    const loaded = await store.get(["project", "memories"], "memory-1");
    expect(loaded?.value.data).toBe("OpenPX uses LangGraph checkpoint as runtime truth.");

    const reopened = await createSqliteStore({ sqlitePath });
    const persisted = await reopened.search(["project"], { query: "checkpoint", limit: 5 });
    expect(persisted.map((item) => item.key)).toContain("memory-1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun test tests/harness/graph/runtime.test.ts
```

Expected: FAIL because `src/harness/graph/runtime.ts` does not exist.

- [ ] **Step 3: Add SQLite checkpointer factory**

Create `src/harness/graph/checkpoint/sqlite-checkpoint.ts`:

```ts
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";

export type CreateSqliteCheckpointerInput = {
  sqlitePath: string;
};

/** 创建 LangGraph SQLite checkpointer；checkpoint 是 agent 恢复真相。 */
export async function createSqliteCheckpointer(input: CreateSqliteCheckpointerInput): Promise<SqliteSaver> {
  const checkpointer = SqliteSaver.fromConnString(input.sqlitePath);
  await checkpointer.setup();
  return checkpointer;
}
```

- [ ] **Step 4: Add SQLite store factory**

Create `src/harness/graph/store/sqlite-store.ts`:

```ts
import { Database } from "bun:sqlite";
import { BaseStore, type Item, type Operation, type OperationResults, type SearchItem } from "@langchain/langgraph-checkpoint";

export type CreateSqliteStoreInput = {
  sqlitePath: string;
};

type StoreRow = {
  namespace_json: string;
  namespace_path: string;
  item_key: string;
  value_json: string;
  created_at: string;
  updated_at: string;
};

type StoreValue = Record<string, unknown>;

function namespaceKey(namespace: string[]): string {
  return JSON.stringify(namespace);
}

function namespacePath(namespace: string[]): string {
  return namespace.join("\u001f");
}

function parseRow(row: StoreRow): Item {
  return {
    namespace: JSON.parse(row.namespace_json) as string[],
    key: row.item_key,
    value: JSON.parse(row.value_json) as StoreValue,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function matchesFilter(value: StoreValue, filter?: Record<string, unknown>): boolean {
  if (!filter) {
    return true;
  }
  return Object.entries(filter).every(([key, expected]) => value[key] === expected);
}

function matchesQuery(value: StoreValue, query?: string): boolean {
  if (!query) {
    return true;
  }
  return JSON.stringify(value).toLowerCase().includes(query.toLowerCase());
}

function isGetOperation(operation: Operation): operation is Operation & { namespace: string[]; key: string } {
  return "namespace" in operation && "key" in operation && !("value" in operation);
}

function isPutOperation(operation: Operation): operation is Operation & { namespace: string[]; key: string; value: StoreValue | null } {
  return "namespace" in operation && "key" in operation && "value" in operation;
}

function isSearchOperation(operation: Operation): operation is Operation & {
  namespacePrefix: string[];
  filter?: Record<string, unknown>;
  limit?: number;
  offset?: number;
  query?: string;
} {
  return "namespacePrefix" in operation;
}

function isListNamespacesOperation(operation: Operation): operation is Operation & {
  limit: number;
  offset: number;
  maxDepth?: number;
} {
  return "limit" in operation && "offset" in operation && !("namespacePrefix" in operation);
}

export class SqliteGraphStore extends BaseStore {
  private readonly db: Database;

  constructor(sqlitePath: string) {
    super();
    this.db = new Database(sqlitePath, { create: true });
  }

  override async start(): Promise<void> {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS langgraph_store (
        namespace_json TEXT NOT NULL,
        namespace_path TEXT NOT NULL,
        item_key TEXT NOT NULL,
        value_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (namespace_json, item_key)
      )
    `);
    this.db.run("CREATE INDEX IF NOT EXISTS idx_langgraph_store_namespace_path ON langgraph_store (namespace_path)");
  }

  override async stop(): Promise<void> {
    this.db.close(false);
  }

  override async get(namespace: string[], key: string): Promise<Item | null> {
    const row = this.db
      .query<StoreRow, [string, string]>(
        `SELECT namespace_json, namespace_path, item_key, value_json, created_at, updated_at
         FROM langgraph_store
         WHERE namespace_json = ? AND item_key = ?`,
      )
      .get(namespaceKey(namespace), key);
    return row ? parseRow(row) : null;
  }

  override async put(namespace: string[], key: string, value: StoreValue, _index?: false | string[]): Promise<void> {
    const existing = await this.get(namespace, key);
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO langgraph_store (namespace_json, namespace_path, item_key, value_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(namespace_json, item_key) DO UPDATE SET
         value_json = excluded.value_json,
         updated_at = excluded.updated_at`,
      [
        namespaceKey(namespace),
        namespacePath(namespace),
        key,
        JSON.stringify(value),
        existing?.createdAt.toISOString() ?? now,
        now,
      ],
    );
  }

  override async delete(namespace: string[], key: string): Promise<void> {
    this.db.run("DELETE FROM langgraph_store WHERE namespace_json = ? AND item_key = ?", [namespaceKey(namespace), key]);
  }

  override async search(namespacePrefix: string[], options: {
    filter?: Record<string, unknown>;
    limit?: number;
    offset?: number;
    query?: string;
  } = {}): Promise<SearchItem[]> {
    const rows = this.db
      .query<StoreRow, []>(
        `SELECT namespace_json, namespace_path, item_key, value_json, created_at, updated_at
         FROM langgraph_store
         ORDER BY updated_at DESC`,
      )
      .all();
    const prefix = namespacePath(namespacePrefix);
    return rows
      .map(parseRow)
      .filter((item) => namespacePath(item.namespace).startsWith(prefix))
      .filter((item) => matchesFilter(item.value as StoreValue, options.filter))
      .filter((item) => matchesQuery(item.value as StoreValue, options.query))
      .slice(options.offset ?? 0, (options.offset ?? 0) + (options.limit ?? 10))
      .map((item) => ({ ...item, score: options.query ? 1 : undefined }));
  }

  override async listNamespaces(options: {
    limit?: number;
    maxDepth?: number;
    offset?: number;
    prefix?: string[];
    suffix?: string[];
  } = {}): Promise<string[][]> {
    const rows = this.db
      .query<{ namespace_json: string }, []>("SELECT DISTINCT namespace_json FROM langgraph_store ORDER BY namespace_json")
      .all();
    return rows
      .map((row) => JSON.parse(row.namespace_json) as string[])
      .filter((namespace) => options.prefix ? namespacePath(namespace).startsWith(namespacePath(options.prefix)) : true)
      .filter((namespace) => options.suffix ? namespacePath(namespace).endsWith(namespacePath(options.suffix)) : true)
      .map((namespace) => options.maxDepth ? namespace.slice(0, options.maxDepth) : namespace)
      .slice(options.offset ?? 0, (options.offset ?? 0) + (options.limit ?? 100));
  }

  override async batch<Op extends Operation[]>(operations: Op): Promise<OperationResults<Op>> {
    const results: unknown[] = [];
    for (const operation of operations) {
      if (isGetOperation(operation)) {
        results.push(await this.get(operation.namespace, operation.key));
      } else if (isPutOperation(operation)) {
        if (operation.value === null) {
          await this.delete(operation.namespace, operation.key);
        } else if (isRecord(operation.value)) {
          await this.put(operation.namespace, operation.key, operation.value);
        }
        results.push(undefined);
      } else if (isSearchOperation(operation)) {
        results.push(await this.search(operation.namespacePrefix, operation));
      } else if (isListNamespacesOperation(operation)) {
        results.push(await this.listNamespaces(operation));
      } else {
        results.push(undefined);
      }
    }
    return results as OperationResults<Op>;
  }
}

export async function createSqliteStore(input: CreateSqliteStoreInput): Promise<SqliteGraphStore> {
  const store = new SqliteGraphStore(input.sqlitePath);
  await store.start();
  return store;
}
```

- [ ] **Step 5: Add root graph**

Create `src/harness/graph/root-graph.ts`:

```ts
import { END, START, StateGraph, StateSchema, MessagesValue, type GraphNode } from "@langchain/langgraph";
import { z } from "zod/v4";

export const OpenPXGraphState = new StateSchema({
  messages: MessagesValue,
  workspace: z.object({
    workspaceRoot: z.string(),
    projectId: z.string(),
    cwd: z.string(),
  }).optional(),
  response: z.object({
    content: z.string(),
  }).optional(),
});

export type OpenPXGraphStateValue = typeof OpenPXGraphState.State;

const routeNode: GraphNode<typeof OpenPXGraphState> = async (state) => {
  return state;
};

const respondNode: GraphNode<typeof OpenPXGraphState> = async (state) => {
  const lastMessage = state.messages.at(-1);
  const content = typeof lastMessage?.content === "string" ? lastMessage.content : "";
  return {
    response: {
      content: `Processed: ${content}`,
    },
    messages: [
      {
        role: "assistant",
        content: `Processed: ${content}`,
      },
    ],
  };
};

export function buildOpenPXRootGraph() {
  return new StateGraph(OpenPXGraphState)
    .addNode("route", routeNode)
    .addNode("respond", respondNode)
    .addEdge(START, "route")
    .addEdge("route", "respond")
    .addEdge("respond", END);
}
```

- [ ] **Step 6: Add graph runtime wrapper**

Create `src/harness/graph/runtime.ts`:

```ts
import { buildOpenPXRootGraph } from "./root-graph";
import { createSqliteCheckpointer } from "./checkpoint/sqlite-checkpoint";
import { createSqliteStore } from "./store/sqlite-store";
import type { OpenPXGraphProjection, OpenPXGraphStateProjection } from "./state";

export type CreateOpenPXGraphRuntimeInput = {
  sqlitePath: string;
};

export type SubmitGraphInput = {
  threadId: string;
  workspaceRoot: string;
  projectId: string;
  cwd: string;
  input: string;
};

export type GraphRuntimeResult = {
  graph: OpenPXGraphProjection;
  state: OpenPXGraphStateProjection;
};

export type OpenPXGraphRuntime = {
  submitInput(input: SubmitGraphInput): Promise<GraphRuntimeResult>;
  getThreadState(input: { threadId: string }): Promise<GraphRuntimeResult>;
};

function projectState(value: Record<string, unknown>, checkpointId?: string): GraphRuntimeResult {
  const response = value.response && typeof value.response === "object"
    ? value.response as { content?: unknown }
    : undefined;
  const workspace = value.workspace && typeof value.workspace === "object"
    ? value.workspace as { workspaceRoot?: unknown; projectId?: unknown; cwd?: unknown }
    : undefined;
  const messages = Array.isArray(value.messages)
    ? value.messages.map((message) => {
        if (message && typeof message === "object") {
          const record = message as { role?: unknown; content?: unknown };
          return {
            role: record.role === "assistant" || record.role === "system" || record.role === "tool" ? record.role : "user",
            content: typeof record.content === "string" ? record.content : "",
          };
        }
        return { role: "user" as const, content: String(message) };
      })
    : [];

  return {
    graph: {
      status: "completed",
      checkpointId,
    },
    state: {
      messages,
      workspace: workspace
        && typeof workspace.workspaceRoot === "string"
        && typeof workspace.projectId === "string"
        && typeof workspace.cwd === "string"
          ? {
              workspaceRoot: workspace.workspaceRoot,
              projectId: workspace.projectId,
              cwd: workspace.cwd,
            }
          : undefined,
      response: typeof response?.content === "string" ? { content: response.content } : undefined,
      metadata: {
        checkpointId,
      },
    },
  };
}

export async function createOpenPXGraphRuntime(input: CreateOpenPXGraphRuntimeInput): Promise<OpenPXGraphRuntime> {
  const checkpointer = await createSqliteCheckpointer({ sqlitePath: input.sqlitePath });
  const store = await createSqliteStore({ sqlitePath: input.sqlitePath });
  const graph = buildOpenPXRootGraph().compile({ checkpointer, store });

  return {
    async submitInput(submitInput) {
      const config = { configurable: { thread_id: submitInput.threadId } };
      const result = await graph.invoke(
        {
          messages: [{ role: "user", content: submitInput.input }],
          workspace: {
            workspaceRoot: submitInput.workspaceRoot,
            projectId: submitInput.projectId,
            cwd: submitInput.cwd,
          },
        },
        config,
      );
      const state = await graph.getState(config);
      return projectState(result as Record<string, unknown>, state.config.configurable?.checkpoint_id);
    },
    async getThreadState(stateInput) {
      const config = { configurable: { thread_id: stateInput.threadId } };
      const state = await graph.getState(config);
      return projectState(state.values as Record<string, unknown>, state.config.configurable?.checkpoint_id);
    },
  };
}
```

- [ ] **Step 7: Export runtime**

Update `src/harness/graph/index.ts`:

```ts
export * from "./events";
export * from "./interrupts";
export * from "./runtime";
export * from "./state";
```

- [ ] **Step 8: Run graph runtime tests**

Run:

```bash
bun test tests/harness/graph/runtime.test.ts
```

Expected: PASS.

- [ ] **Step 9: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/harness/graph tests/harness/graph/runtime.test.ts
git commit -m "feat: add langgraph root runtime"
```

---

### Task 4: Add Interrupt Resume and Tool Approval Wrappers

**Files:**
- Modify: `src/harness/graph/root-graph.ts`
- Modify: `src/harness/graph/runtime.ts`
- Create: `src/harness/graph/tools/approval-tool-wrapper.ts`
- Create: `tests/harness/graph/interrupt-resume.test.ts`
- Create: `tests/harness/graph/approval-tool-wrapper.test.ts`

- [ ] **Step 1: Write interrupt/resume runtime test**

Create `tests/harness/graph/interrupt-resume.test.ts`:

```ts
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { createOpenPXGraphRuntime } from "../../src/harness/graph/runtime";

describe("OpenPX graph interrupt resume", () => {
  test("pauses with an approval interrupt and resumes with Command({ resume })", async () => {
    const dir = await mkdtemp(join(tmpdir(), "openpx-graph-interrupt-"));
    const runtime = await createOpenPXGraphRuntime({ sqlitePath: join(dir, "openpx.sqlite") });

    const interrupted = await runtime.submitInput({
      threadId: "thread-interrupt-1",
      workspaceRoot: "/workspace",
      projectId: "project-1",
      cwd: "/workspace",
      input: "delete src/legacy.ts",
    });

    expect(interrupted.graph.status).toBe("interrupted");
    expect(interrupted.graph.pendingInterrupt?.kind).toBe("approval");

    const resumed = await runtime.resumeInterrupt({
      threadId: "thread-interrupt-1",
      resume: {
        requestId: interrupted.graph.pendingInterrupt?.requestId ?? "",
        decision: "approved",
        reason: "测试批准",
      },
    });

    expect(resumed.graph.status).toBe("completed");
    expect(resumed.state.response?.content).toContain("approved");
  });
});
```

- [ ] **Step 2: Write approval wrapper test**

Create `tests/harness/graph/approval-tool-wrapper.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { createApprovalToolRequest } from "../../src/harness/graph/tools/approval-tool-wrapper";

describe("approval tool wrapper", () => {
  test("creates JSON-serializable approval interrupt payloads", () => {
    const payload = createApprovalToolRequest({
      requestId: "approval-1",
      toolName: "apply_patch",
      summary: "删除 src/legacy.ts",
      risk: "high",
      argsPreview: { path: "src/legacy.ts" },
      cwd: "/workspace",
      affectedPaths: ["src/legacy.ts"],
      recommendedDecision: "rejected",
    });

    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
    expect(payload.resumeSchema).toBe("approval-v1");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
bun test tests/harness/graph/interrupt-resume.test.ts tests/harness/graph/approval-tool-wrapper.test.ts
```

Expected: FAIL because `resumeInterrupt` and approval wrapper do not exist.

- [ ] **Step 4: Add approval payload helper**

Create `src/harness/graph/tools/approval-tool-wrapper.ts`:

```ts
import type { ApprovalInterruptPayload } from "../interrupts";

export type CreateApprovalToolRequestInput = Omit<ApprovalInterruptPayload, "kind" | "resumeSchema">;

/** 生成可被 LangGraph interrupt() 直接返回给 surface 的审批请求。 */
export function createApprovalToolRequest(input: CreateApprovalToolRequestInput): ApprovalInterruptPayload {
  return {
    ...input,
    kind: "approval",
    resumeSchema: "approval-v1",
  };
}
```

- [ ] **Step 5: Update root graph to interrupt on high-risk delete intent**

Modify `src/harness/graph/root-graph.ts` so `respondNode` calls `interrupt()` when the latest user message starts with `delete `:

```ts
import { END, START, StateGraph, StateSchema, MessagesValue, interrupt, type GraphNode } from "@langchain/langgraph";
import { z } from "zod/v4";
import { createApprovalToolRequest } from "./tools/approval-tool-wrapper";
import { graphResumeValueSchema } from "./interrupts";

export const OpenPXGraphState = new StateSchema({
  messages: MessagesValue,
  workspace: z.object({
    workspaceRoot: z.string(),
    projectId: z.string(),
    cwd: z.string(),
  }).optional(),
  response: z.object({
    content: z.string(),
  }).optional(),
});

export type OpenPXGraphStateValue = typeof OpenPXGraphState.State;

const routeNode: GraphNode<typeof OpenPXGraphState> = async (state) => {
  return state;
};

const respondNode: GraphNode<typeof OpenPXGraphState> = async (state) => {
  const lastMessage = state.messages.at(-1);
  const content = typeof lastMessage?.content === "string" ? lastMessage.content : "";
  if (content.startsWith("delete ")) {
    const targetPath = content.slice("delete ".length).trim();
    const resume = graphResumeValueSchema.parse(interrupt(createApprovalToolRequest({
      requestId: `approval:${targetPath}`,
      toolName: "apply_patch",
      summary: `删除 ${targetPath}`,
      risk: "high",
      argsPreview: { path: targetPath },
      cwd: state.workspace?.cwd ?? state.workspace?.workspaceRoot ?? "",
      affectedPaths: [targetPath],
      recommendedDecision: "rejected",
    })));

    return {
      response: {
        content: resume.decision === "approved"
          ? `approved delete request for ${targetPath}`
          : `rejected delete request for ${targetPath}`,
      },
      messages: [
        {
          role: "assistant",
          content: resume.decision === "approved"
            ? `approved delete request for ${targetPath}`
            : `rejected delete request for ${targetPath}`,
        },
      ],
    };
  }

  return {
    response: {
      content: `Processed: ${content}`,
    },
    messages: [
      {
        role: "assistant",
        content: `Processed: ${content}`,
      },
    ],
  };
};

export function buildOpenPXRootGraph() {
  return new StateGraph(OpenPXGraphState)
    .addNode("route", routeNode)
    .addNode("respond", respondNode)
    .addEdge(START, "route")
    .addEdge("route", "respond")
    .addEdge("respond", END);
}
```

- [ ] **Step 6: Add resume support to graph runtime**

Modify `src/harness/graph/runtime.ts`:

```ts
import { Command, INTERRUPT, isInterrupted } from "@langchain/langgraph";
import { buildOpenPXRootGraph } from "./root-graph";
import { createSqliteCheckpointer } from "./checkpoint/sqlite-checkpoint";
import { createSqliteStore } from "./store/sqlite-store";
import { graphInterruptPayloadSchema, graphResumeValueSchema, type GraphResumeValue } from "./interrupts";
import type { OpenPXGraphProjection, OpenPXGraphStateProjection } from "./state";

export type CreateOpenPXGraphRuntimeInput = {
  sqlitePath: string;
};

export type SubmitGraphInput = {
  threadId: string;
  workspaceRoot: string;
  projectId: string;
  cwd: string;
  input: string;
};

export type ResumeGraphInterruptInput = {
  threadId: string;
  resume: GraphResumeValue;
};

export type GraphRuntimeResult = {
  graph: OpenPXGraphProjection;
  state: OpenPXGraphStateProjection;
};

export type OpenPXGraphRuntime = {
  submitInput(input: SubmitGraphInput): Promise<GraphRuntimeResult>;
  resumeInterrupt(input: ResumeGraphInterruptInput): Promise<GraphRuntimeResult>;
  getThreadState(input: { threadId: string }): Promise<GraphRuntimeResult>;
};

function projectState(value: Record<string, unknown>, checkpointId?: string): GraphRuntimeResult {
  const interruptValues = "__interrupt__" in value && Array.isArray(value.__interrupt__)
    ? value.__interrupt__
    : [];
  const pendingInterrupt = interruptValues[0] && typeof interruptValues[0] === "object"
    ? graphInterruptPayloadSchema.safeParse((interruptValues[0] as { value?: unknown }).value)
    : undefined;
  const response = value.response && typeof value.response === "object"
    ? value.response as { content?: unknown }
    : undefined;
  const workspace = value.workspace && typeof value.workspace === "object"
    ? value.workspace as { workspaceRoot?: unknown; projectId?: unknown; cwd?: unknown }
    : undefined;
  const messages = Array.isArray(value.messages)
    ? value.messages.map((message) => {
        if (message && typeof message === "object") {
          const record = message as { role?: unknown; content?: unknown };
          return {
            role: record.role === "assistant" || record.role === "system" || record.role === "tool" ? record.role : "user",
            content: typeof record.content === "string" ? record.content : "",
          };
        }
        return { role: "user" as const, content: String(message) };
      })
    : [];

  return {
    graph: {
      status: pendingInterrupt?.success ? "interrupted" : "completed",
      checkpointId,
      pendingInterrupt: pendingInterrupt?.success ? pendingInterrupt.data : undefined,
    },
    state: {
      messages,
      workspace: workspace
        && typeof workspace.workspaceRoot === "string"
        && typeof workspace.projectId === "string"
        && typeof workspace.cwd === "string"
          ? {
              workspaceRoot: workspace.workspaceRoot,
              projectId: workspace.projectId,
              cwd: workspace.cwd,
            }
          : undefined,
      interrupt: pendingInterrupt?.success ? pendingInterrupt.data : undefined,
      response: typeof response?.content === "string" ? { content: response.content } : undefined,
      metadata: {
        checkpointId,
      },
    },
  };
}

export async function createOpenPXGraphRuntime(input: CreateOpenPXGraphRuntimeInput): Promise<OpenPXGraphRuntime> {
  const checkpointer = await createSqliteCheckpointer({ sqlitePath: input.sqlitePath });
  const store = await createSqliteStore({ sqlitePath: input.sqlitePath });
  const graph = buildOpenPXRootGraph().compile({ checkpointer, store });

  async function projectLatest(threadId: string, output: unknown): Promise<GraphRuntimeResult> {
    const config = { configurable: { thread_id: threadId } };
    const state = await graph.getState(config);
    return projectState(output as Record<string, unknown>, state.config.configurable?.checkpoint_id);
  }

  return {
    async submitInput(submitInput) {
      const config = { configurable: { thread_id: submitInput.threadId } };
      const result = await graph.invoke(
        {
          messages: [{ role: "user", content: submitInput.input }],
          workspace: {
            workspaceRoot: submitInput.workspaceRoot,
            projectId: submitInput.projectId,
            cwd: submitInput.cwd,
          },
        },
        config,
      );
      return projectLatest(submitInput.threadId, result);
    },
    async resumeInterrupt(resumeInput) {
      const parsedResume = graphResumeValueSchema.parse(resumeInput.resume);
      const config = { configurable: { thread_id: resumeInput.threadId } };
      const result = await graph.invoke(new Command({ resume: parsedResume }), config);
      if (isInterrupted(result)) {
        const interrupted = result[INTERRUPT]?.[0]?.value;
        return projectLatest(resumeInput.threadId, { ...result, __interrupt__: [{ value: interrupted }] });
      }
      return projectLatest(resumeInput.threadId, result);
    },
    async getThreadState(stateInput) {
      const config = { configurable: { thread_id: stateInput.threadId } };
      const state = await graph.getState(config);
      return projectState(state.values as Record<string, unknown>, state.config.configurable?.checkpoint_id);
    },
  };
}
```

- [ ] **Step 7: Run interrupt tests**

Run:

```bash
bun test tests/harness/graph/interrupt-resume.test.ts tests/harness/graph/approval-tool-wrapper.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run graph test suite**

Run:

```bash
bun test tests/harness/graph
```

Expected: PASS.

- [ ] **Step 9: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/harness/graph tests/harness/graph
git commit -m "feat: route approvals through langgraph interrupts"
```

---

### Task 5: Add LangGraph Streaming Adapter

**Files:**
- Create: `src/harness/graph/streaming/stream-adapter.ts`
- Modify: `src/harness/graph/runtime.ts`
- Create: `tests/harness/graph/stream-adapter.test.ts`

- [ ] **Step 1: Write streaming adapter tests**

Create `tests/harness/graph/stream-adapter.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { mapLangGraphStreamChunk } from "../../src/harness/graph/streaming/stream-adapter";

describe("LangGraph stream adapter", () => {
  test("maps updates mode chunks to graph node events", () => {
    expect(
      mapLangGraphStreamChunk({
        threadId: "thread-1",
        mode: "updates",
        chunk: { respond: { response: { content: "done" } } },
      }),
    ).toEqual([
      {
        type: "graph.node_updated",
        payload: {
          threadId: "thread-1",
          node: "respond",
          update: { response: { content: "done" } },
        },
      },
    ]);
  });

  test("maps message chunks to message delta events", () => {
    expect(
      mapLangGraphStreamChunk({
        threadId: "thread-1",
        mode: "messages",
        chunk: [{ content: "hello" }, { langgraph_node: "respond" }],
      }),
    ).toEqual([
      {
        type: "message.delta",
        payload: {
          threadId: "thread-1",
          node: "respond",
          content: "hello",
          index: 0,
        },
      },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun test tests/harness/graph/stream-adapter.test.ts
```

Expected: FAIL because `stream-adapter.ts` does not exist.

- [ ] **Step 3: Add stream adapter**

Create `src/harness/graph/streaming/stream-adapter.ts`:

```ts
import type { GraphRuntimeEvent } from "../events";

export type LangGraphStreamMode = "updates" | "messages" | "custom" | "tools" | "debug";

export type MapLangGraphStreamChunkInput = {
  threadId: string;
  mode: LangGraphStreamMode;
  chunk: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function mapLangGraphStreamChunk(input: MapLangGraphStreamChunkInput): GraphRuntimeEvent[] {
  if (input.mode === "updates" && isRecord(input.chunk)) {
    return Object.entries(input.chunk).map(([node, update]) => ({
      type: "graph.node_updated",
      payload: {
        threadId: input.threadId,
        node,
        update: isRecord(update) ? update : { value: update },
      },
    }));
  }

  if (input.mode === "messages" && Array.isArray(input.chunk)) {
    const [message, metadata] = input.chunk;
    const content = isRecord(message) ? readString(message.content) : undefined;
    const node = isRecord(metadata) ? readString(metadata.langgraph_node) : undefined;
    if (!content) {
      return [];
    }
    return [
      {
        type: "message.delta",
        payload: {
          threadId: input.threadId,
          node,
          content,
          index: 0,
        },
      },
    ];
  }

  if (input.mode === "tools" && isRecord(input.chunk)) {
    const event = readString(input.chunk.event);
    const name = readString(input.chunk.name) ?? "tool";
    if (event === "on_tool_start") {
      return [{
        type: "tool.started",
        payload: { threadId: input.threadId, toolCallId: name, toolName: name },
      }];
    }
    if (event === "on_tool_end") {
      return [{
        type: "tool.completed",
        payload: { threadId: input.threadId, toolCallId: name, toolName: name, result: input.chunk.data },
      }];
    }
    if (event === "on_tool_error") {
      return [{
        type: "tool.failed",
        payload: { threadId: input.threadId, toolCallId: name, toolName: name, error: "tool failed" },
      }];
    }
  }

  return [];
}
```

- [ ] **Step 4: Add streaming method to graph runtime**

Modify `OpenPXGraphRuntime` in `src/harness/graph/runtime.ts` to include:

```ts
streamInput(input: SubmitGraphInput): AsyncGenerator<GraphRuntimeEvent, GraphRuntimeResult, void>;
```

Implement it by calling:

```ts
for await (const [mode, chunk] of await graph.stream(inputs, {
  configurable: { thread_id: input.threadId },
  streamMode: ["updates", "messages", "tools"],
  subgraphs: true,
})) {
  for (const event of mapLangGraphStreamChunk({ threadId: input.threadId, mode, chunk })) {
    yield event;
  }
}
return this.getThreadState({ threadId: input.threadId });
```

Use a local helper instead of `this` inside the returned object so TypeScript preserves method binding:

```ts
async function getThreadState(threadId: string): Promise<GraphRuntimeResult> {
  const config = { configurable: { thread_id: threadId } };
  const state = await graph.getState(config);
  return projectState(state.values as Record<string, unknown>, state.config.configurable?.checkpoint_id);
}
```

- [ ] **Step 5: Run streaming tests**

Run:

```bash
bun test tests/harness/graph/stream-adapter.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run graph tests**

Run:

```bash
bun test tests/harness/graph
```

Expected: PASS.

- [ ] **Step 7: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/harness/graph tests/harness/graph/stream-adapter.test.ts
git commit -m "feat: adapt langgraph streams to runtime events"
```

---

### Task 6: Replace Protocol Schemas with Graph-Native Commands, Events, and Snapshot

**Files:**
- Modify: `src/harness/protocol/commands/runtime-command-schema.ts`
- Modify: `src/harness/protocol/events/runtime-event-schema.ts`
- Modify: `src/harness/protocol/views/runtime-snapshot-schema.ts`
- Modify: `src/harness/protocol/views/runtime-snapshot-builder.ts`
- Modify: `src/harness/protocol/schemas/api-schema.ts`
- Modify: `tests/runtime/runtime-protocol-schema.test.ts`
- Modify: `tests/runtime/runtime-snapshot.test.ts`

- [ ] **Step 1: Replace protocol schema tests**

In `tests/runtime/runtime-protocol-schema.test.ts`, replace the agent-run and run-loop-specific tests with graph-native assertions:

```ts
test("runtime command schema accepts graph-native commands", () => {
  expect(runtimeCommandSchema.parse({ kind: "submit_input", text: "hello" }).kind).toBe("submit_input");
  expect(
    runtimeCommandSchema.parse({
      kind: "resume_interrupt",
      threadId: "thread-1",
      resume: {
        requestId: "approval-1",
        decision: "approved",
      },
    }).kind,
  ).toBe("resume_interrupt");
  expect(runtimeCommandSchema.parse({ kind: "cancel_invocation", threadId: "thread-1" }).kind).toBe("cancel_invocation");
});

test("runtime events accept graph-native event names", () => {
  expect(
    runtimeEventSchema.parse({
      type: "graph.interrupted",
      payload: {
        threadId: "thread-1",
        interrupt: {
          kind: "clarification",
          requestId: "clarify-1",
          question: "目标文件是哪一个？",
        },
      },
    }).type,
  ).toBe("graph.interrupted");

  expect(
    runtimeEventSchema.safeParse({
      type: "loop.step_started",
      payload: {
        threadId: "thread-1",
        runId: "run-1",
        taskId: "task-1",
        step: "plan",
      },
    }).success,
  ).toBe(false);
});
```

In `tests/runtime/runtime-snapshot.test.ts`, replace `agentRuns`, `threadMode`, `blockingReason`, and `human_recovery` assertions with:

```ts
expect(snapshot.graph.status).toBe("completed");
expect(snapshot.graph.checkpointId).toBe("checkpoint-1");
expect(snapshot.messages[0]?.content).toBe("What is the status?");
expect(snapshot.graphActivities).toEqual([]);
```

- [ ] **Step 2: Run protocol tests to verify they fail**

Run:

```bash
bun test tests/runtime/runtime-protocol-schema.test.ts tests/runtime/runtime-snapshot.test.ts
```

Expected: FAIL because protocol schemas still expose v1 runtime fields and events.

- [ ] **Step 3: Replace runtime command schema**

Replace `src/harness/protocol/commands/runtime-command-schema.ts` with:

```ts
import { z } from "zod";
import { graphResumeValueSchema } from "../../../harness/graph/interrupts";

/** runtime 命令协议：surface 只表达 graph invocation 与 interrupt resume。 */
export const runtimeCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("new_thread") }),
  z.object({ kind: z.literal("switch_thread"), threadId: z.string().min(1) }),
  z.object({ kind: z.literal("submit_input"), threadId: z.string().min(1).optional(), text: z.string().min(1), background: z.boolean().optional() }),
  z.object({ kind: z.literal("resume_interrupt"), threadId: z.string().min(1), resume: graphResumeValueSchema }),
  z.object({ kind: z.literal("cancel_invocation"), threadId: z.string().min(1) }),
]);

export type RuntimeCommand = z.infer<typeof runtimeCommandSchema>;
```

- [ ] **Step 4: Replace runtime event schema v1 event list**

Modify `src/harness/protocol/events/runtime-event-schema.ts` so `runtimeEventTypes` is:

```ts
export const runtimeEventTypes = [
  "thread.started",
  "thread.view_updated",
  "task.created",
  "task.updated",
  "task.started",
  "task.completed",
  "task.failed",
  "graph.started",
  "graph.node_updated",
  "graph.interrupted",
  "graph.resumed",
  "graph.checkpoint_saved",
  "graph.completed",
  "graph.failed",
  "message.delta",
  "tool.started",
  "tool.completed",
  "tool.failed",
  "model.status",
  "model.invocation_started",
  "model.first_token_received",
  "model.completed",
  "model.failed",
  "model.telemetry",
] as const;
```

Then replace loop, recovery, and agent-run payload schemas with `graphRuntimeEventSchema` from `src/harness/graph/events.ts`. Keep model and task payload schemas.

- [ ] **Step 5: Replace runtime snapshot schema**

Replace `src/harness/protocol/views/runtime-snapshot-schema.ts` with:

```ts
import { z } from "zod";
import { answerViewSchema } from "./answer-view";
import { messageViewSchema } from "./message-view";
import { taskViewSchema } from "./task-view";
import { threadViewSchema } from "./thread-view";
import { graphActivitySchema, openPXGraphProjectionSchema } from "../../../harness/graph/state";
import { protocolVersionSchema } from "../schemas/protocol-version";

/** runtime snapshot 协议：LangGraph runtime 的稳定投影视图。 */
export const runtimeSnapshotSchema = z.object({
  protocolVersion: protocolVersionSchema,
  workspaceRoot: z.string(),
  projectId: z.string(),
  lastEventSeq: z.number().int().nonnegative(),
  activeThreadId: z.string().optional(),
  graph: openPXGraphProjectionSchema,
  threads: z.array(threadViewSchema),
  tasks: z.array(taskViewSchema),
  answers: z.array(answerViewSchema),
  messages: z.array(messageViewSchema),
  graphActivities: z.array(graphActivitySchema),
  memory: z.array(z.object({
    namespace: z.array(z.string().min(1)),
    key: z.string().min(1),
    summary: z.string(),
  }).strict()),
});

export type RuntimeSnapshot = z.infer<typeof runtimeSnapshotSchema>;
```

- [ ] **Step 6: Update snapshot builder**

Modify `src/harness/protocol/views/runtime-snapshot-builder.ts` so the returned object matches the new schema. The minimal graph defaults are:

```ts
graph: input.graph ?? { status: "idle" },
messages: input.messages ?? [],
graphActivities: input.graphActivities ?? [],
memory: input.memory ?? [],
```

Remove fields:

```ts
activeRunId
threadMode
recommendationReason
planDecision
executionSummary
verificationSummary
pauseSummary
latestExecutionStatus
blockingReason
runs
pendingApprovals
agentRuns
```

- [ ] **Step 7: Run protocol tests**

Run:

```bash
bun test tests/runtime/runtime-protocol-schema.test.ts tests/runtime/runtime-snapshot.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run full runtime schema tests**

Run:

```bash
bun test tests/runtime
```

Expected: FAIL only in tests that still assert v1 run-loop, agent-run, approval, or recovery semantics. Record those files for Task 9 cleanup.

- [ ] **Step 9: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: FAIL only in call sites still passing v1 fields into snapshot/protocol builders. These are intentionally fixed in Task 7 and Task 8.

- [ ] **Step 10: Commit protocol schema cutover**

Commit only if Step 7 passes and the Step 8/9 failures are the expected v1 call-site failures:

```bash
git add src/harness/protocol tests/runtime/runtime-protocol-schema.test.ts tests/runtime/runtime-snapshot.test.ts
git commit -m "feat: expose graph-native runtime protocol"
```

---

### Task 7: Wire Graph Runtime into Session Kernel and Bootstrap

**Files:**
- Modify: `src/app/bootstrap.ts`
- Modify: `src/app/app-context-assembly.ts`
- Modify: `src/harness/core/session/session-kernel.ts`
- Modify: `src/harness/core/session/runtime-command-handler.ts`
- Modify: `src/harness/server/http/runtime-router.ts`
- Modify: `tests/kernel/session-kernel.test.ts`
- Modify: `tests/app/bootstrap.test.ts`
- Create: `tests/runtime/graph-session-integration.test.ts`

- [ ] **Step 1: Write graph session integration test**

Create `tests/runtime/graph-session-integration.test.ts`:

```ts
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { createAppContext } from "../../src/app/bootstrap";

describe("graph session integration", () => {
  test("submit_input reaches LangGraph runtime and updates snapshot", async () => {
    const dir = await mkdtemp(join(tmpdir(), "openpx-graph-session-"));
    const context = await createAppContext({
      workspaceRoot: dir,
      dataDir: join(dir, ".openpx"),
      projectId: "project-1",
    });

    const result = await context.kernel.handleCommand({
      type: "submit_input",
      payload: { text: "hello graph" },
    });

    expect(result.status).toBe("completed");

    const snapshot = await context.session.getSnapshot();
    expect(snapshot.graph.status).toBe("completed");
    expect(snapshot.messages.at(-1)?.content).toContain("hello graph");

    await context.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun test tests/runtime/graph-session-integration.test.ts
```

Expected: FAIL because session kernel still calls the v1 control plane.

- [ ] **Step 3: Replace session command types**

In `src/harness/core/session/session-kernel.ts`, replace v1 command unions with:

```ts
export type SubmitInputCommand = {
  type: "submit_input";
  payload: {
    text: string;
    background?: boolean;
  };
};

export type ResumeInterruptCommand = {
  type: "resume_interrupt";
  payload: {
    threadId: string;
    resume: GraphResumeValue;
  };
};

export type CancelInvocationCommand = {
  type: "cancel_invocation";
  payload: {
    threadId: string;
  };
};

export type SessionCommand =
  | SubmitInputCommand
  | ResumeInterruptCommand
  | CancelInvocationCommand
  | { type: "new_thread"; payload?: Record<string, never> }
  | { type: "switch_thread"; payload: { threadId: string } };
```

Import `GraphResumeValue` from `src/harness/graph/interrupts.ts`.

- [ ] **Step 4: Replace control-plane dependency with graph runtime dependency**

In `createSessionKernel`, replace `controlPlane` methods with:

```ts
graphRuntime: {
  submitInput(input: SubmitGraphInput): Promise<GraphRuntimeResult>;
  resumeInterrupt(input: ResumeGraphInterruptInput): Promise<GraphRuntimeResult>;
  getThreadState(input: { threadId: string }): Promise<GraphRuntimeResult>;
};
```

Import `SubmitGraphInput`, `ResumeGraphInterruptInput`, and `GraphRuntimeResult` from `src/harness/graph/runtime.ts`.

- [ ] **Step 5: Map `submit_input` to graph runtime**

In `handleCommand`, when receiving `submit_input`, create or reuse the active thread, then call:

```ts
const graphResult = await deps.graphRuntime.submitInput({
  threadId: thread.threadId,
  workspaceRoot: thread.workspaceRoot,
  projectId: thread.projectId,
  cwd: deps.workspaceRoot ?? thread.workspaceRoot,
  input: command.payload.text,
});
```

Then project a session result with graph fields:

```ts
const result: SessionCommandResult = {
  status: graphResult.graph.status === "interrupted" ? "waiting_input" : "completed",
  threadId: thread.threadId,
  graph: graphResult.graph,
  messages: graphResult.state.messages.map((message, index) => ({
    messageId: `message_${thread.threadId}_${index}`,
    threadId: thread.threadId,
    role: message.role === "assistant" ? "assistant" : "user",
    content: message.content,
  })),
  answers: graphResult.state.response
    ? [{
        answerId: `answer_${thread.threadId}`,
        threadId: thread.threadId,
        content: graphResult.state.response.content,
      }]
    : [],
  tasks: [],
  approvals: [],
  graphActivities: [],
  memory: [],
  workspaceRoot: thread.workspaceRoot,
  projectId: thread.projectId,
  threads: await getThreadSummaries(),
};
```

- [ ] **Step 6: Map `resume_interrupt` to graph runtime**

In `handleCommand`, when receiving `resume_interrupt`, call:

```ts
const graphResult = await deps.graphRuntime.resumeInterrupt({
  threadId: command.payload.threadId,
  resume: command.payload.resume,
});
```

Project the result using the same helper as `submit_input`.

- [ ] **Step 7: Update bootstrap graph runtime assembly**

In `src/app/bootstrap.ts`, remove `createRunLoopEngine` assembly and create graph runtime:

```ts
const graphRuntime = await createOpenPXGraphRuntime({
  sqlitePath: config.sqlitePath,
});
```

Pass `graphRuntime` into `createSessionKernel`.

- [ ] **Step 8: Update HTTP/runtime command router**

In `src/harness/core/session/runtime-command-handler.ts` and `src/harness/server/http/runtime-router.ts`, map protocol commands:

```ts
submit_input -> kernel.handleCommand({ type: "submit_input", payload: { text, background } })
resume_interrupt -> kernel.handleCommand({ type: "resume_interrupt", payload: { threadId, resume } })
cancel_invocation -> kernel.handleCommand({ type: "cancel_invocation", payload: { threadId } })
```

Remove mappings for:

```text
approve
reject
resolve_approval
resolve_plan_decision
restart_run
abandon_run
agent_run_*
```

- [ ] **Step 9: Run graph session integration test**

Run:

```bash
bun test tests/runtime/graph-session-integration.test.ts
```

Expected: PASS.

- [ ] **Step 10: Run kernel and app tests**

Run:

```bash
bun test tests/kernel/session-kernel.test.ts tests/app/bootstrap.test.ts
```

Expected: PASS after updating assertions to graph-native session results.

- [ ] **Step 11: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: FAIL only where v1 modules are still imported by tests or surfaces. These are removed in Task 8 and Task 9.

- [ ] **Step 12: Commit**

```bash
git add src/app src/harness/core/session src/harness/server tests/runtime/graph-session-integration.test.ts tests/kernel/session-kernel.test.ts tests/app/bootstrap.test.ts
git commit -m "feat: route session commands to langgraph runtime"
```

---

### Task 8: Update TUI to Graph and Interrupt Projections

**Files:**
- Modify: `src/surfaces/tui/components/approval-panel.tsx`
- Modify: `src/surfaces/tui/components/agent-run-panel.tsx`
- Modify: `src/surfaces/tui/components/status-bar.tsx`
- Modify: `src/surfaces/tui/components/utility-pane.tsx`
- Modify: `src/surfaces/tui/session-sync.ts`
- Modify: `src/surfaces/tui/runtime/runtime-client.ts`
- Modify: `tests/interface/tui-app.test.tsx`
- Modify: `tests/interface/agent-run-panel.test.tsx`
- Create: `tests/interface/interrupt-panel.test.tsx`

- [ ] **Step 1: Write interrupt panel test**

Create `tests/interface/interrupt-panel.test.tsx`:

```tsx
import React from "react";
import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { InterruptPanel } from "../../src/surfaces/tui/components/approval-panel";

describe("InterruptPanel", () => {
  test("renders approval interrupt payload", () => {
    const { lastFrame } = render(
      <InterruptPanel
        interrupt={{
          kind: "approval",
          requestId: "approval-1",
          toolName: "apply_patch",
          summary: "修改 README.md",
          risk: "medium",
          argsPreview: { path: "README.md" },
          cwd: "/workspace",
          affectedPaths: ["README.md"],
          recommendedDecision: "approved",
          resumeSchema: "approval-v1",
        }}
      />,
    );

    const frame = lastFrame() ?? "";
    expect(frame).toContain("apply_patch");
    expect(frame).toContain("修改 README.md");
    expect(frame).toContain("README.md");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun test tests/interface/interrupt-panel.test.tsx
```

Expected: FAIL because `InterruptPanel` is not exported.

- [ ] **Step 3: Rename approval panel export to InterruptPanel**

In `src/surfaces/tui/components/approval-panel.tsx`, export:

```tsx
import React from "react";
import { Box, Text } from "ink";
import type { GraphInterruptPayload } from "../../../harness/graph/interrupts";

export function InterruptPanel({ interrupt }: { interrupt?: GraphInterruptPayload }) {
  if (!interrupt) {
    return null;
  }

  if (interrupt.kind === "approval") {
    return (
      <Box flexDirection="column">
        <Text color="yellow">Approval required</Text>
        <Text>{interrupt.summary}</Text>
        <Text>Tool: {interrupt.toolName}</Text>
        <Text>Risk: {interrupt.risk}</Text>
        <Text>Paths: {interrupt.affectedPaths.join(", ")}</Text>
      </Box>
    );
  }

  if (interrupt.kind === "plan_decision") {
    return (
      <Box flexDirection="column">
        <Text color="cyan">Decision required</Text>
        <Text>{interrupt.question}</Text>
        {interrupt.options.map((option, index) => (
          <Text key={option.id}>{index + 1}. {option.label}</Text>
        ))}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="yellow">Input required</Text>
      <Text>{"question" in interrupt ? interrupt.question : interrupt.requestId}</Text>
    </Box>
  );
}
```

Keep a compatibility export name only inside this file for tests that import the old component during this task:

```tsx
export const ApprovalPanel = InterruptPanel;
```

Remove the compatibility export in Task 9 after callers are updated.

- [ ] **Step 4: Rename agent-run panel to graph activity panel**

In `src/surfaces/tui/components/agent-run-panel.tsx`, export:

```tsx
import React from "react";
import { Box, Text } from "ink";
import type { GraphActivity } from "../../../harness/graph/state";

export function GraphActivityPanel({ activities }: { activities: GraphActivity[] }) {
  if (activities.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column">
      <Text color="cyan">Graph activity</Text>
      {activities.map((activity) => (
        <Text key={activity.id}>{activity.label}: {activity.status}</Text>
      ))}
    </Box>
  );
}
```

- [ ] **Step 5: Update TUI call sites**

Update `app-screen-view.ts`, `utility-pane.tsx`, and related composition files:

```tsx
<InterruptPanel interrupt={snapshot.graph.pendingInterrupt} />
<GraphActivityPanel activities={snapshot.graphActivities} />
```

Remove references to:

```text
pendingApprovals
agentRuns
latestExecutionStatus === "waiting_approval"
```

- [ ] **Step 6: Update runtime client command mapping**

In `src/surfaces/tui/runtime/runtime-client.ts`, replace approve/reject calls with:

```ts
sendCommand({
  kind: "resume_interrupt",
  threadId,
  resume: {
    requestId,
    decision: "approved",
  },
});
```

For rejection:

```ts
sendCommand({
  kind: "resume_interrupt",
  threadId,
  resume: {
    requestId,
    decision: "rejected",
    reason,
  },
});
```

- [ ] **Step 7: Run interface tests**

Run:

```bash
bun test tests/interface/interrupt-panel.test.tsx tests/interface/tui-app.test.tsx tests/interface/agent-run-panel.test.tsx
```

Expected: PASS after updating `agent-run-panel.test.tsx` to import `GraphActivityPanel`.

- [ ] **Step 8: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: FAIL only for deleted v1 modules scheduled in Task 9.

- [ ] **Step 9: Commit**

```bash
git add src/surfaces tests/interface
git commit -m "feat: render langgraph interrupts and activity"
```

---

### Task 9: Remove v1 Runtime, AgentRun, Recovery, and Custom Memory Code

**Files:**
- Delete: `src/harness/core/run-loop/`
- Delete: `src/persistence/ports/run-state-store.ts`
- Delete: `src/persistence/sqlite/sqlite-run-state-store.ts`
- Delete: `src/domain/agent-run.ts`
- Delete: `src/control/agent-runs/`
- Delete: `src/control/agents/agent-run-adapter.ts`
- Delete: `src/control/agents/subagent-registry.ts`
- Delete: `src/control/agents/subagent-spec.ts`
- Delete: `src/control/agents/system-agent-spec.ts`
- Delete: `src/domain/memory.ts`
- Delete: `src/persistence/ports/memory-store-port.ts`
- Delete: `src/persistence/sqlite/sqlite-memory-store.ts`
- Delete: `src/control/context/memory-consolidator.ts`
- Modify: `src/persistence/sqlite/sqlite-migrator.ts`
- Modify: `src/app/bootstrap.ts`
- Modify: `src/app/app-context-assembly.ts`
- Delete or rewrite: tests under `tests/harness/run-loop/`, `tests/persistence/sqlite-run-state-store.test.ts`, `tests/persistence/sqlite-memory-store.test.ts`, `tests/domain/agent-run*.test.ts`, `tests/domain/memory.test.ts`, `tests/control/agent-run*.test.ts`

- [ ] **Step 1: Run import scan before deletion**

Run:

```bash
rg -n "run-loop|RunLoop|RunStateStore|RunSuspension|ContinuationEnvelope|AgentRun|agentRun|memoryStore|MemoryStore|SqliteMemoryStore|MemoryConsolidator|subagent" src tests
```

Expected: shows all remaining v1 references to remove or rewrite.

- [ ] **Step 2: Remove old SQLite schema creation**

In `src/persistence/sqlite/sqlite-migrator.ts`, remove creation, columns, and indexes for:

```text
memories
agent_runs
run_loop_states
run_suspensions
run_continuations
system_migrations entry for legacy checkpoint invalidation
```

Keep:

```text
threads
runs
tasks
approvals
events
execution_ledger
eval_* tables
```

- [ ] **Step 3: Remove old store assembly**

In `src/app/bootstrap.ts` and `src/app/app-context-assembly.ts`, remove construction and dependency injection for:

```ts
memoryStore
runStateStore
agentRunStore
createMemoryConsolidator
createAgentRunManager
createPassiveAgentRunRuntimeFactory
```

- [ ] **Step 4: Delete old runtime files**

Run:

```bash
rm -rf src/harness/core/run-loop src/control/agent-runs
rm -f src/persistence/ports/run-state-store.ts src/persistence/sqlite/sqlite-run-state-store.ts
rm -f src/domain/agent-run.ts src/domain/memory.ts
rm -f src/persistence/ports/memory-store-port.ts src/persistence/sqlite/sqlite-memory-store.ts
rm -f src/control/context/memory-consolidator.ts
rm -f src/control/agents/agent-run-adapter.ts src/control/agents/subagent-registry.ts src/control/agents/subagent-spec.ts src/control/agents/system-agent-spec.ts
```

- [ ] **Step 5: Delete v1-only tests**

Run:

```bash
rm -rf tests/harness/run-loop
rm -f tests/persistence/sqlite-run-state-store.test.ts tests/persistence/sqlite-memory-store.test.ts
rm -f tests/domain/agent-run-lifecycle.test.ts tests/domain/agent-run.test.ts tests/domain/memory.test.ts
rm -f tests/control/agent-run-scratch-policy.test.ts tests/control/agent-run-manager.test.ts tests/control/memory-retrieval.test.ts
rm -f tests/runtime/agent-run-lifecycle-protocol.test.ts tests/runtime/agent-run-view.test.ts
```

- [ ] **Step 6: Remove stale exports**

Update `src/harness/core/index.ts`, `src/domain/*` barrel exports, `src/persistence/*` barrel exports, and any protocol exports so deleted modules are not exported.

Use:

```bash
rg -n "agent-run|agentRun|memory-store|run-state-store|run-loop|subagent-spec|system-agent-spec" src
```

Expected after edits: no matches except historical docs in `docs/superpowers/specs/2026-04-23-langgraph-v2-agent-runtime-design.md` and the implementation plan.

- [ ] **Step 7: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 8: Run focused graph/protocol tests**

Run:

```bash
bun test tests/harness/graph tests/runtime/runtime-protocol-schema.test.ts tests/runtime/runtime-snapshot.test.ts tests/runtime/graph-session-integration.test.ts
```

Expected: PASS.

- [ ] **Step 9: Run full tests**

Run:

```bash
bun test
```

Expected: PASS after all v1-only tests are deleted or rewritten.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor: remove custom agent runtime semantics"
```

---

### Task 10: Update Control Documents and Knowledge Space

**Files:**
- Modify: `CONTROL.md`
- Modify: `ARCHITECTURE.md`
- Modify: `ROADMAP.md`
- Modify: `docs/space/index.md`
- Modify: `docs/space/understanding/harness-spine.md`
- Modify: `docs/space/understanding/harness-invariants.md`
- Modify: `docs/space/understanding/harness-protocol.md`
- Modify: `docs/space/understanding/agent-mode-ontology.md`
- Modify: `docs/space/understanding/state-flows.md`
- Modify: `docs/space/understanding/harness-code-map.md`
- Modify: `docs/space/execution/coding-workflow.md`
- Modify: `docs/space/execution/validation-workflow.md`

- [ ] **Step 1: Write documentation consistency check**

Create `tests/docs/langgraph-v2-docs.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const requiredFiles = [
  "CONTROL.md",
  "ARCHITECTURE.md",
  "ROADMAP.md",
  "docs/space/understanding/harness-spine.md",
  "docs/space/understanding/harness-protocol.md",
  "docs/space/understanding/state-flows.md",
];

describe("LangGraph v2 documentation", () => {
  test("root control docs name LangGraph as the agent runtime", () => {
    for (const file of requiredFiles) {
      const content = readFileSync(file, "utf8");
      expect(content).toContain("LangGraph");
    }
  });

  test("root control docs no longer describe run-loop as the execution kernel", () => {
    for (const file of ["CONTROL.md", "ARCHITECTURE.md", "ROADMAP.md"]) {
      const content = readFileSync(file, "utf8");
      expect(content).not.toContain("run-loop 为执行内核");
      expect(content).not.toContain("mixed recovery");
    }
  });
});
```

- [ ] **Step 2: Run documentation test to verify it fails**

Run:

```bash
bun test tests/docs/langgraph-v2-docs.test.ts
```

Expected: FAIL because root docs still describe v1 run-loop semantics.

- [ ] **Step 3: Update `CONTROL.md`**

Change the control definition to state:

```md
OpenPX v2 采用 LangGraph-first agent runtime 模型：

- LangGraph 是 agent runtime；
- LangGraph checkpoint 是 agent 执行状态、暂停、恢复、短期记忆和 replay / time travel 的真相源；
- LangGraph SQLite store 是长期记忆真相源；
- OpenPX harness 是本地 Agent OS 壳层，负责 workspace / project / thread 产品上下文、protocol、surface、工具环境、权限 UI 与审计；
- OpenPX 不再定义独立 run-loop、suspension、continuation、human_recovery、AgentRun 或自定义 memory truth。
```

Remove v1 sections:

```text
Run-loop 恢复合同
AgentRun 边界
Plan mode 决策挂起合同
```

Replace them with:

```md
## LangGraph Interrupt 合同

approval、plan decision、clarification、credential 和 external block 都是 LangGraph interrupt payload。
surface 通过 `resume_interrupt` 命令恢复，runtime 内部调用 `Command({ resume })`。
OpenPX 可保存审计记录，但不得用审计表定义恢复语义。
```

- [ ] **Step 4: Update `ARCHITECTURE.md`**

Set the main spine to:

```md
package.json -> src/app/main.ts -> src/runtime/service/runtime-daemon.ts -> src/harness/server/harness-session-registry.ts -> harness session -> src/harness/graph -> protocol / app server -> surfaces
```

State:

```md
`src/harness/graph/` 是唯一 agent 底层入口；`src/harness/core/` 只保留 session、projection、event bridge 和 command bridge。
```

- [ ] **Step 5: Update `ROADMAP.md`**

Replace current phase with:

```md
当前阶段是 LangGraph v2 runtime integration：

1. 建立 LangGraph root graph
2. 使用 SQLite checkpoint / store
3. 通过 interrupt / resume 承载权限和人在环路流程
4. 通过 stream modes 承载实时输出
5. 删除 OpenPX 自定义 agent 底层语义
6. 用 graph trajectory / checkpoint / interrupt / stream 重新定义评测闭环
```

- [ ] **Step 6: Update docs/space understanding and execution docs**

In each modified `docs/space/*` file, replace v1 terms with the v2 vocabulary:

```text
run-loop -> LangGraph root graph
suspension / continuation -> interrupt / Command({ resume })
AgentRun -> graph activity / subgraph activity
MemoryStorePort -> LangGraph SQLite store
run_loop_states -> LangGraph checkpoint
```

Keep `docs/space/` index-based access rules unchanged.

- [ ] **Step 7: Run documentation test**

Run:

```bash
bun test tests/docs/langgraph-v2-docs.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run full tests and typecheck**

Run:

```bash
bun run typecheck
bun test
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add CONTROL.md ARCHITECTURE.md ROADMAP.md docs/space tests/docs/langgraph-v2-docs.test.ts
git commit -m "docs: align control docs with langgraph runtime"
```

---

### Task 11: Final Validation and Cleanup

**Files:**
- Modify only files identified by the validation commands in this task.
- Test: full repository test suite.

- [ ] **Step 1: Run no-v1-runtime scan**

Run:

```bash
rg -n "run-loop|RunLoop|RunStateStore|RunSuspension|ContinuationEnvelope|human_recovery|AgentRun|agentRun|MemoryStorePort|SqliteMemoryStore|MemoryConsolidator|waiting_approval|restart_run|abandon_run" src tests CONTROL.md ARCHITECTURE.md ROADMAP.md docs/space
```

Expected: no matches in `src` or active tests. Matches in historical design/plan docs are acceptable only under `docs/superpowers/`.

- [ ] **Step 2: Run graph feature tests**

Run:

```bash
bun test tests/harness/graph tests/runtime/graph-session-integration.test.ts tests/interface/interrupt-panel.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run full test suite**

Run:

```bash
bun test
```

Expected: PASS.

- [ ] **Step 5: Run TUI smoke start**

Run:

```bash
bun run dev
```

Expected: TUI starts, displays a graph-native snapshot, and no import error appears. Stop it with `Ctrl-C` after startup.

- [ ] **Step 6: Commit validation fixes**

If validation required edits:

```bash
git add -A
git commit -m "fix: complete langgraph runtime cutover"
```

If validation required no edits, do not create an empty commit.

## Self-Review Notes

- Spec coverage:
  - LangGraph `StateGraph`: Tasks 1, 3.
  - SQLite checkpoint: Tasks 1, 3.
  - SQLite long-term memory/store boundary: Tasks 3, 9, 10. Task 3 implements a LangGraph `BaseStore` SQLite backend directly and keeps OpenPX from introducing a separate memory abstraction.
  - Interrupt / resume: Task 4 and Task 7.
  - Streaming: Task 5.
  - Protocol and surface projection: Task 6, Task 7, Task 8.
  - Removal of custom OpenPX agent semantics: Task 9.
  - Documentation truth update: Task 10.
  - Full validation: Task 11.
- Placeholder scan:
  The plan avoids placeholder markers and unspecified edge-case instructions.
- Type consistency:
  `GraphResumeValue`, `GraphRuntimeResult`, `OpenPXGraphProjection`, `GraphRuntimeEvent`, and command names are introduced before later tasks reference them.
