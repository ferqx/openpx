import { INTERRUPT, isInterrupted } from "@langchain/langgraph";
import { resolve } from "node:path";
import { createApprovalService, type ApprovalService, type CreateApprovalInput } from "../control/policy/approval-service";
import { createPolicyEngine } from "../control/policy/policy-engine";
import { createTaskManager } from "../control/tasks/task-manager";
import type { ControlTask } from "../control/tasks/task-types";
import { createToolRegistry } from "../control/tools/tool-registry";
import type { ToolExecuteRequest } from "../control/tools/tool-types";
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
import { createModelGateway, type ModelGateway } from "../infra/model-gateway";
import { resolveConfig } from "../shared/config";

type AppStores = ReturnType<typeof createStores>;

type ControlPlane = {
  startRootTask(threadId: string, text: string): Promise<SessionControlPlaneResult>;
  approveRequest(approvalRequestId: string): Promise<SessionControlPlaneResult>;
  rejectRequest(approvalRequestId: string): Promise<SessionControlPlaneResult>;
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
    async updateStatus(approvalRequestId, status) {
      const updated = await approvals.updateStatus(approvalRequestId, status);
      const persisted = updated ?? (await stores.approvalStore.get(approvalRequestId));
      if (!persisted) {
        return undefined;
      }

      const next = { ...persisted, status };
      await stores.approvalStore.save(next);
      return next;
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

function ensureControlTask(task: {
  taskId: string;
  threadId: string;
  summary?: string;
  status: ControlTask["status"];
}): ControlTask {
  return {
    taskId: task.taskId,
    threadId: task.threadId,
    summary: task.summary ?? task.taskId,
    status: task.status,
  };
}

function summarizeApprovedAction(summary: string, workspaceRoot: string, requestPath?: string): string {
  if (!requestPath) {
    return summary;
  }

  const relativePath = requestPath.startsWith(workspaceRoot)
    ? requestPath.slice(workspaceRoot.length).replace(/^\/+/, "")
    : requestPath;

  if (summary.includes("delete_file")) {
    return `Deleted ${relativePath}`;
  }

  return summary;
}

function resolveApprovalToolRequest(
  approval: Awaited<ReturnType<ApprovalService["get"]>>,
  workspaceRoot: string,
): ToolExecuteRequest | undefined {
  if (!approval) {
    return undefined;
  }

  if (approval.toolRequest?.toolName) {
    return {
      toolCallId: approval.toolRequest.toolCallId,
      threadId: approval.toolRequest.threadId,
      taskId: approval.toolRequest.taskId,
      toolName: approval.toolRequest.toolName,
      args: approval.toolRequest.args,
      path: approval.toolRequest.path,
      action: approval.toolRequest.action as ToolExecuteRequest["action"],
      changedFiles: approval.toolRequest.changedFiles,
    };
  }

  const legacyDeleteMatch = approval.summary.match(/^apply_patch delete_file (.+)$/);
  if (!legacyDeleteMatch) {
    return undefined;
  }

  const relativePath = legacyDeleteMatch[1]?.trim();
  if (!relativePath) {
    return undefined;
  }

  return {
    toolCallId: approval.toolCallId,
    threadId: approval.threadId,
    taskId: approval.taskId,
    toolName: "apply_patch",
    args: {},
    action: "delete_file",
    path: resolve(workspaceRoot, relativePath),
    changedFiles: 1,
  };
}

async function createControlPlane(input: {
  config: ReturnType<typeof resolveConfig>;
  stores: AppStores;
  checkpointer: ReturnType<typeof createSqliteCheckpointer>;
  modelGateway: ModelGateway;
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
    planner: async ({ input: text, threadId, taskId }) => ({
      summary: (await input.modelGateway.plan({ prompt: text, threadId, taskId })).summary,
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

    async approveRequest(approvalRequestId: string) {
      const approval = await approvals.get(approvalRequestId);
      if (!approval) {
        throw new Error(`approval request ${approvalRequestId} not found`);
      }
      const toolRequest = resolveApprovalToolRequest(approval, input.config.workspaceRoot);
      if (!toolRequest) {
        throw new Error(`approval request ${approvalRequestId} cannot be resumed without a stored tool request`);
      }

      const currentTask =
        (await input.stores.taskStore.get(approval.taskId)) ??
        ({
          taskId: approval.taskId,
          threadId: approval.threadId,
          summary: approval.summary,
          status: "blocked",
        } satisfies ControlTask);
      const runningTask = await saveTaskStatus(input.stores, ensureControlTask(currentTask), "running");
      const outcome = await toolRegistry.executeApproved(toolRequest);
      await approvals.updateStatus(approvalRequestId, "approved");
      const pendingApprovals = await input.stores.approvalStore.listPendingByThread(approval.threadId);

      if (outcome.kind === "executed") {
        const completedTask = await saveTaskStatus(input.stores, runningTask, "completed");
        return {
          status: pendingApprovals.length > 0 ? "waiting_approval" : "completed",
          task: completedTask,
          approvals: pendingApprovals,
          summary: summarizeApprovedAction(approval.summary, input.config.workspaceRoot, toolRequest.path),
        };
      }

      const failedTask = await saveTaskStatus(input.stores, runningTask, "failed");
      return {
        status: pendingApprovals.length > 0 ? "waiting_approval" : "completed",
        task: failedTask,
        approvals: pendingApprovals,
        summary: `Unable to complete approved action: ${outcome.reason}`,
      };
    },

    async rejectRequest(approvalRequestId: string) {
      const approval = await approvals.get(approvalRequestId);
      if (!approval) {
        throw new Error(`approval request ${approvalRequestId} not found`);
      }

      await approvals.updateStatus(approvalRequestId, "rejected");
      const currentTask =
        (await input.stores.taskStore.get(approval.taskId)) ??
        ({
          taskId: approval.taskId,
          threadId: approval.threadId,
          summary: approval.summary,
          status: "blocked",
        } satisfies ControlTask);
      const cancelledTask = await saveTaskStatus(input.stores, ensureControlTask(currentTask), "cancelled");
      const pendingApprovals = await input.stores.approvalStore.listPendingByThread(approval.threadId);

      return {
        status: pendingApprovals.length > 0 ? "waiting_approval" : "completed",
        task: cancelledTask,
        approvals: pendingApprovals,
        summary: `Rejected ${approval.summary}`,
      };
    },
  };
}

export async function createAppContext(input: {
  workspaceRoot: string;
  dataDir: string;
  modelGateway?: ModelGateway;
}) {
  const config = resolveConfig(input);
  const sqlite = createSqlite(config.dataDir);
  migrateSqlite(sqlite);

  const stores = createStores(sqlite);
  const checkpointer = createSqliteCheckpointer(config.checkpointConnString);
  const modelGateway =
    input.modelGateway ??
    createModelGateway({
      apiKey: config.model.apiKey,
      baseURL: config.model.baseURL,
      modelName: config.model.name,
    });
  const controlPlane = await createControlPlane({ config, stores, checkpointer, modelGateway });
  const kernel = createSessionKernel({ stores, controlPlane });

  return { config, stores, controlPlane, kernel };
}
