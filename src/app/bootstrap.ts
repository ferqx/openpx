import { INTERRUPT, isInterrupted } from "@langchain/langgraph";
import { resolve } from "node:path";
import { createApprovalService, type ApprovalService, type CreateApprovalInput } from "../control/policy/approval-service";
import { createPolicyEngine } from "../control/policy/policy-engine";
import { createTaskManager } from "../control/tasks/task-manager";
import type { ControlTask } from "../control/tasks/task-types";
import { createToolRegistry } from "../control/tools/tool-registry";
import { createSessionKernel, type SessionControlPlaneResult } from "../kernel/session-kernel";
import { createSqliteCheckpointer } from "../persistence/sqlite/sqlite-checkpointer";
import { createSqlite } from "../persistence/sqlite/sqlite-client";
import { migrateSqlite } from "../persistence/sqlite/sqlite-migrator";
import { SqliteApprovalStore } from "../persistence/sqlite/sqlite-approval-store";
import { SqliteEventLog } from "../persistence/sqlite/sqlite-event-log";
import { SqliteMemoryStore } from "../persistence/sqlite/sqlite-memory-store";
import { SqliteTaskStore } from "../persistence/sqlite/sqlite-task-store";
import { SqliteThreadStore } from "../persistence/sqlite/sqlite-thread-store";
import { createRootGraph } from "../runtime/graph/root/graph";
import { resolveConfig } from "../shared/config";

type AppStores = ReturnType<typeof createStores>;

type ControlPlane = {
  startRootTask(threadId: string, text: string): Promise<SessionControlPlaneResult>;
};

function createStores(path: string | ReturnType<typeof createSqlite>) {
  return {
    threadStore: new SqliteThreadStore(path),
    taskStore: new SqliteTaskStore(path),
    approvalStore: new SqliteApprovalStore(path),
    eventLog: new SqliteEventLog(path),
    memoryStore: new SqliteMemoryStore(path),
  };
}

function createPersistentApprovalService(stores: AppStores): ApprovalService {
  const approvals = createApprovalService();

  return {
    async createPending(request: CreateApprovalInput) {
      const approval = await approvals.createPending(request);
      await stores.approvalStore.save(approval);
      return approval;
    },
    async get(approvalRequestId: string) {
      return stores.approvalStore.get(approvalRequestId);
    },
    async listPendingByThread(threadId: string) {
      return stores.approvalStore.listPendingByThread(threadId);
    },
  };
}

function parseDeleteRequest(input: string, workspaceRoot: string) {
  const match = input.trim().match(/^delete\s+(.+)$/i);
  if (!match) {
    return undefined;
  }

  const relativePath = match[1]?.trim();
  if (!relativePath) {
    return undefined;
  }

  return {
    relativePath,
    absolutePath: resolve(workspaceRoot, relativePath),
  };
}

async function saveTaskStatus(stores: AppStores, task: ControlTask, status: ControlTask["status"]): Promise<ControlTask> {
  const next = { ...task, status };
  await stores.taskStore.save(next);
  return next;
}

async function createControlPlane(input: {
  config: ReturnType<typeof resolveConfig>;
  stores: AppStores;
  checkpointer: ReturnType<typeof createSqliteCheckpointer>;
}): Promise<ControlPlane> {
  const taskManager = createTaskManager({
    taskStore: input.stores.taskStore,
    eventLog: input.stores.eventLog,
  });
  const approvals = createPersistentApprovalService(input.stores);
  const toolRegistry = createToolRegistry({
    policy: createPolicyEngine({ workspaceRoot: input.config.workspaceRoot }),
    approvals,
  });
  const rootGraph = await createRootGraph({
    checkpointer: input.checkpointer,
    planner: async ({ input: text }) => ({
      summary: `Planned request: ${text}`,
      mode: "plan",
    }),
    verifier: async ({ input: text }) => ({
      summary: `Verified request: ${text}`,
      mode: "verify",
    }),
    executor: async ({ input: text, threadId, taskId }) => {
      const deleteRequest = parseDeleteRequest(text, input.config.workspaceRoot);
      if (!deleteRequest || !threadId || !taskId) {
        return {
          summary: `Executed request: ${text}`,
          mode: "execute",
        };
      }

      const outcome = await toolRegistry.execute({
        toolCallId: `${taskId}:apply_patch`,
        threadId,
        taskId,
        toolName: "apply_patch",
        action: "delete_file",
        path: deleteRequest.absolutePath,
        changedFiles: 1,
        args: {},
      });

      if (outcome.kind === "blocked") {
        return {
          summary: `Approval required before deleting ${deleteRequest.relativePath}`,
          mode: "execute",
        };
      }

      if (outcome.kind === "executed") {
        return {
          summary: `Deleted ${deleteRequest.relativePath}`,
          mode: "execute",
        };
      }

      return {
        summary: `Unable to delete ${deleteRequest.relativePath}: ${outcome.reason}`,
        mode: "execute",
      };
    },
  });

  return {
    async startRootTask(threadId: string, text: string) {
      let task = await taskManager.createRootTask(threadId, text);
      task = await saveTaskStatus(input.stores, task, "running");

      const graphResult = await rootGraph.invoke(
        { input: text },
        {
          configurable: {
            thread_id: threadId,
            task_id: task.taskId,
          },
        },
      );
      const approvalsForThread = await input.stores.approvalStore.listPendingByThread(threadId);
      const status = approvalsForThread.length > 0 ? "waiting_approval" : "completed";
      const finalTask = await saveTaskStatus(input.stores, task, status === "waiting_approval" ? "blocked" : "completed");
      const interruptValue = isInterrupted(graphResult)
        ? (graphResult[INTERRUPT][0]?.value as { summary?: string } | undefined)
        : undefined;
      const summary = isInterrupted(graphResult)
        ? String(interruptValue?.summary ?? text)
        : (graphResult as { summary: string }).summary;

      return {
        status,
        task: finalTask,
        approvals: approvalsForThread,
        summary,
      };
    },
  };
}

export async function createAppContext(input: { workspaceRoot: string; dataDir: string }) {
  const config = resolveConfig(input);
  const sqlite = createSqlite(config.dataDir);
  migrateSqlite(sqlite);

  const stores = createStores(sqlite);
  const checkpointer = createSqliteCheckpointer(config.checkpointConnString);
  const controlPlane = await createControlPlane({ config, stores, checkpointer });
  const kernel = createSessionKernel({ stores, controlPlane });

  return { config, stores, controlPlane, kernel };
}
