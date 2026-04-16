import type { ApprovalRequest } from "../domain/approval";
import type { Run } from "../domain/run";
import type { ApprovalService } from "../control/policy/approval-service";
import type { ControlTask } from "../control/tasks/task-types";
import type { ToolExecuteRequest, ToolExecutionOutcome } from "../control/tools/tool-types";
import { buildApprovalContinuation } from "../harness/core/run-loop/approval-suspension";
import type { SessionControlPlaneResult } from "../harness/core/session/session-kernel";
import {
  buildRejectedApprovalReason,
  deriveCapabilityMarkerFromApprovalSummary,
} from "../runtime/planning/planner-normalization";
import {
  ensureControlTask,
  resolveApprovalToolRequest,
  summarizeApprovedAction,
} from "./control-plane-support";

/** 审批决议路径依赖：既包括审批存储，也包括 run/task 恢复与工具执行能力 */
type ApprovalResolutionDeps = {
  workspaceRoot: string;
  approvals: ApprovalService;
  getRun: (runId: string) => Promise<Run | undefined>;
  getTask: (taskId: string) => Promise<ControlTask | undefined>;
  listPendingApprovals: (threadId: string) => Promise<ApprovalRequest[]>;
  saveTaskStatus: (task: ControlTask, status: ControlTask["status"]) => Promise<ControlTask>;
  updateRunStatus: (run: Run, status: Run["status"], patch?: Partial<Run>) => Promise<Run>;
  executeApprovedTool: (request: ToolExecuteRequest) => Promise<ToolExecutionOutcome>;
  hasSuspension: (runId: string, threadId: string) => Promise<boolean>;
  buildCurrentResult: (input: {
    threadId: string;
    run: Run;
    resumeDisposition: SessionControlPlaneResult["resumeDisposition"];
    fallbackTaskSummary: string;
  }) => Promise<SessionControlPlaneResult>;
  startRootTask: (threadId: string, input: string | import("../harness/core/run-loop/continuation").ContinuationEnvelope) => Promise<SessionControlPlaneResult>;
};

/** suspension 已缺失时，用审批记录兜底构造最小 task 视图 */
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
  if (approval.status !== "pending" && run) {
    return deps.buildCurrentResult({
      threadId: approval.threadId,
      run,
      resumeDisposition: run.blockingReason?.kind === "human_recovery" ? "not_resumable" : "already_resolved",
      fallbackTaskSummary: approval.summary,
    });
  }
  const toolRequest = resolveApprovalToolRequest(approval, deps.workspaceRoot);
  if (!toolRequest) {
    throw new Error(`approval request ${approvalRequestId} cannot be resumed without a stored tool request`);
  }

  await deps.approvals.updateStatus(approvalRequestId, "approved");
  const hasSuspension = run ? await deps.hasSuspension(run.runId, approval.threadId) : false;

  // 没有 suspension 时，说明无法回到 run-loop 中点继续执行；
  // 此时退化为“直接执行已批准工具，然后手动收尾 run/task 状态”。
  if (!hasSuspension || !run) {
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
        finalResponse: pendingApprovals.length > 0
          ? undefined
          : summarizeApprovedAction(approval.summary, deps.workspaceRoot, toolRequest.path),
        executionSummary: summarizeApprovedAction(approval.summary, deps.workspaceRoot, toolRequest.path),
        pauseSummary: pendingApprovals.length > 0 ? "Additional approvals are still pending." : undefined,
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
      finalResponse: pendingApprovals.length > 0
        ? undefined
        : `Unable to complete approved action: ${outcome.reason}`,
      executionSummary: `Unable to complete approved action: ${outcome.reason}`,
      pauseSummary: pendingApprovals.length > 0 ? "Additional approvals are still pending." : undefined,
    };
  }

  // 有 suspension 时，优先回到原 run-loop 恢复点，让 engine 自己继续处理后续状态。
  await deps.updateRunStatus(run, "waiting_approval", {
    activeTaskId: approval.taskId,
    blockingReason: undefined,
    endedAt: undefined,
  });

  return deps.startRootTask(
    approval.threadId,
    buildApprovalContinuation({
      threadId: approval.threadId,
      runId: run.runId,
      taskId: approval.taskId,
      approvalRequestId,
      decision: "approved",
      step: "execute",
    }),
  );
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
  if (approval.status !== "pending" && run) {
    return deps.buildCurrentResult({
      threadId: approval.threadId,
      run,
      resumeDisposition: run.blockingReason?.kind === "human_recovery" ? "not_resumable" : "already_resolved",
      fallbackTaskSummary: approval.summary,
    });
  }
  await deps.approvals.updateStatus(approvalRequestId, "rejected");
  const hasSuspension = run ? await deps.hasSuspension(run.runId, approval.threadId) : false;

  if (hasSuspension && run) {
    const capabilityMarker =
      approval.toolRequest?.toolName && approval.toolRequest?.action
        ? `${approval.toolRequest.toolName}.${approval.toolRequest.action}`
        : deriveCapabilityMarkerFromApprovalSummary(approval.summary);

    return deps.startRootTask(
      approval.threadId,
      buildApprovalContinuation({
        threadId: approval.threadId,
        runId: run.runId,
        taskId: approval.taskId,
        approvalRequestId,
        decision: "rejected",
        reason: buildRejectedApprovalReason(approval.summary, capabilityMarker),
        step: "plan",
      }),
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
    finalResponse: pendingApprovals.length > 0 ? undefined : `Rejected ${approval.summary}`,
    pauseSummary: pendingApprovals.length > 0 ? "Additional approvals are still pending." : undefined,
  };
}
