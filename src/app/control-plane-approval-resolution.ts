import type { ApprovalRequest } from "../domain/approval";
import type { Run } from "../domain/run";
import type { ApprovalService } from "../control/policy/approval-service";
import type { ControlTask } from "../control/tasks/task-types";
import type { ToolExecuteRequest, ToolExecutionOutcome } from "../control/tools/tool-types";
import type { SessionControlPlaneResult } from "../kernel/session-kernel";
import type { ResumeControl } from "../runtime/graph/root/resume-control";
import {
  buildRejectedApprovalReason,
  deriveCapabilityMarkerFromApprovalSummary,
} from "../runtime/planning/planner-normalization";
import {
  canResetThreadCheckpoint,
  ensureControlTask,
  resolveApprovalToolRequest,
  summarizeApprovedAction,
} from "./control-plane-support";

type ApprovalResolutionDeps = {
  workspaceRoot: string;
  approvals: ApprovalService;
  getRun: (runId: string) => Promise<Run | undefined>;
  getTask: (taskId: string) => Promise<ControlTask | undefined>;
  listPendingApprovals: (threadId: string) => Promise<ApprovalRequest[]>;
  saveTaskStatus: (task: ControlTask, status: ControlTask["status"]) => Promise<ControlTask>;
  updateRunStatus: (run: Run, status: Run["status"], patch?: Partial<Run>) => Promise<Run>;
  executeApprovedTool: (request: ToolExecuteRequest) => Promise<ToolExecutionOutcome>;
  getCheckpoint: (threadId: string) => Promise<unknown>;
  deleteCheckpoint?: (threadId: string) => Promise<void>;
  startRootTask: (threadId: string, input: string | ResumeControl) => Promise<SessionControlPlaneResult>;
};

function buildFallbackTask(approval: ApprovalRequest): ControlTask {
  return {
    taskId: approval.taskId,
    threadId: approval.threadId,
    runId: approval.runId,
    summary: approval.summary,
    status: "blocked",
  };
}

export async function resolveApprovedRequest(
  deps: ApprovalResolutionDeps,
  approvalRequestId: string,
): Promise<SessionControlPlaneResult> {
  const approval = await deps.approvals.get(approvalRequestId);
  if (!approval) {
    throw new Error(`approval request ${approvalRequestId} not found`);
  }

  const run = approval.runId ? await deps.getRun(approval.runId) : undefined;
  const toolRequest = resolveApprovalToolRequest(approval, deps.workspaceRoot);
  if (!toolRequest) {
    throw new Error(`approval request ${approvalRequestId} cannot be resumed without a stored tool request`);
  }

  await deps.approvals.updateStatus(approvalRequestId, "approved");
  const checkpoint = await deps.getCheckpoint(approval.threadId);

  if (!checkpoint || !run) {
    const currentTask = (await deps.getTask(approval.taskId)) ?? buildFallbackTask(approval);
    const runningTask = await deps.saveTaskStatus(ensureControlTask(currentTask), "running");
    if (run) {
      await deps.updateRunStatus(run, "running", {
        activeTaskId: runningTask.taskId,
        blockingReason: undefined,
        endedAt: undefined,
      });
    }

    const outcome = await deps.executeApprovedTool(toolRequest);
    const pendingApprovals = await deps.listPendingApprovals(approval.threadId);

    if (outcome.kind === "executed") {
      const completedTask = await deps.saveTaskStatus(runningTask, "completed");
      if (run) {
        await deps.updateRunStatus(run, pendingApprovals.length > 0 ? "waiting_approval" : "completed", {
          activeTaskId: completedTask.taskId,
          resultSummary: summarizeApprovedAction(approval.summary, deps.workspaceRoot, toolRequest.path),
          blockingReason:
            pendingApprovals.length > 0
              ? {
                  kind: "waiting_approval",
                  message: "Additional approvals are still pending.",
                }
              : undefined,
          endedAt: pendingApprovals.length > 0 ? undefined : new Date().toISOString(),
        });
      }

      return {
        status: pendingApprovals.length > 0 ? "waiting_approval" : "completed",
        task: completedTask,
        approvals: pendingApprovals,
        summary: summarizeApprovedAction(approval.summary, deps.workspaceRoot, toolRequest.path),
      };
    }

    const failedTask = await deps.saveTaskStatus(runningTask, "failed");
    if (run) {
      await deps.updateRunStatus(run, "failed", {
        activeTaskId: failedTask.taskId,
        resultSummary: `Unable to complete approved action: ${outcome.reason}`,
      });
    }

    return {
      status: pendingApprovals.length > 0 ? "waiting_approval" : "completed",
      task: failedTask,
      approvals: pendingApprovals,
      summary: `Unable to complete approved action: ${outcome.reason}`,
    };
  }

  await deps.updateRunStatus(run, "waiting_approval", {
    activeTaskId: approval.taskId,
    blockingReason: undefined,
    endedAt: undefined,
  });

  return deps.startRootTask(approval.threadId, {
    kind: "approval_resolution",
    decision: "approved",
    approvalRequestId,
  });
}

export async function resolveRejectedRequest(
  deps: ApprovalResolutionDeps,
  approvalRequestId: string,
): Promise<SessionControlPlaneResult> {
  const approval = await deps.approvals.get(approvalRequestId);
  if (!approval) {
    throw new Error(`approval request ${approvalRequestId} not found`);
  }

  const run = approval.runId ? await deps.getRun(approval.runId) : undefined;
  await deps.approvals.updateStatus(approvalRequestId, "rejected");
  const checkpoint = run ? await deps.getCheckpoint(approval.threadId) : undefined;

  if (checkpoint && run) {
    const currentTask = (await deps.getTask(approval.taskId)) ?? buildFallbackTask(approval);
    const cancelledTask = await deps.saveTaskStatus(ensureControlTask(currentTask), "cancelled");
    await deps.updateRunStatus(run, "completed", {
      activeTaskId: cancelledTask.taskId,
      resultSummary: `Rejected ${approval.summary}`,
      blockingReason: undefined,
      endedAt: new Date().toISOString(),
    });

    if (deps.deleteCheckpoint && canResetThreadCheckpoint({ deleteThread: deps.deleteCheckpoint })) {
      await deps.deleteCheckpoint(approval.threadId);
    }

    const capabilityMarker =
      approval.toolRequest?.toolName && approval.toolRequest?.action
        ? `${approval.toolRequest.toolName}.${approval.toolRequest.action}`
        : deriveCapabilityMarkerFromApprovalSummary(approval.summary);

    return deps.startRootTask(
      approval.threadId,
      buildRejectedApprovalReason(approval.summary, capabilityMarker),
    );
  }

  const currentTask = (await deps.getTask(approval.taskId)) ?? buildFallbackTask(approval);
  const cancelledTask = await deps.saveTaskStatus(ensureControlTask(currentTask), "cancelled");
  const pendingApprovals = await deps.listPendingApprovals(approval.threadId);

  if (run) {
    await deps.updateRunStatus(run, pendingApprovals.length > 0 ? "waiting_approval" : "completed", {
      activeTaskId: cancelledTask.taskId,
      resultSummary: `Rejected ${approval.summary}`,
      blockingReason:
        pendingApprovals.length > 0
          ? {
              kind: "waiting_approval",
              message: "Additional approvals are still pending.",
            }
          : undefined,
      endedAt: pendingApprovals.length > 0 ? undefined : new Date().toISOString(),
    });
  }

  return {
    status: pendingApprovals.length > 0 ? "waiting_approval" : "completed",
    task: cancelledTask,
    approvals: pendingApprovals,
    summary: `Rejected ${approval.summary}`,
  };
}
