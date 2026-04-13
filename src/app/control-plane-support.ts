import { isAbsolute, relative, resolve } from "node:path";
import type { ApprovalRequest } from "../domain/approval";
import type { Thread } from "../domain/thread";
import type { ModelGatewayError } from "../infra/model-gateway";
import type { ThreadStorePort } from "../persistence/ports/thread-store-port";
import type { TaskStorePort } from "../persistence/ports/task-store-port";
import { compactThreadView } from "../control/context/thread-compaction-policy";
import { createThreadStateProjector } from "../control/context/thread-state-projector";
import type { ControlTask } from "../control/tasks/task-types";
import type { ToolExecuteRequest } from "../control/tools/tool-types";
import type { ResumeControl } from "../runtime/graph/root/resume-control";

type ControlPlaneStores = {
  taskStore: TaskStorePort;
  threadStore: ThreadStorePort;
};

type ResettableCheckpointerLike = {
  deleteThread?: (threadId: string) => Promise<void>;
};

// 这组辅助函数只服务于 control-plane：
// 负责 task 状态落盘、approval 请求还原、resume 输入整理，以及
// responder prompt 拼装等“支持性逻辑”。
export async function saveTaskStatus(
  stores: ControlPlaneStores,
  task: ControlTask,
  status: ControlTask["status"],
): Promise<ControlTask> {
  const next = { ...task, status };
  await stores.taskStore.save(next);

  const thread = await stores.threadStore.get(task.threadId);
  if (!thread) {
    return next;
  }

  const projector = createThreadStateProjector();
  const nextView = projector.project(
    {
      recoveryFacts: thread.recoveryFacts,
      narrativeState: thread.narrativeState,
      workingSetWindow: thread.workingSetWindow,
    },
    { kind: "task", task: next },
  );

  const shouldCompact =
    status === "blocked" || status === "completed" || status === "cancelled" || status === "failed";
  const compactedView = shouldCompact ? compactThreadView(nextView, { trigger: "boundary" }) : nextView;

  await stores.threadStore.save({
    ...thread,
    recoveryFacts: compactedView.recoveryFacts,
    narrativeState: compactedView.narrativeState,
    workingSetWindow: compactedView.workingSetWindow,
  });

  return next;
}

export function ensureControlTask(task: {
  taskId: string;
  threadId: string;
  runId?: string;
  summary?: string;
  status: ControlTask["status"];
}): ControlTask {
  return {
    taskId: task.taskId,
    threadId: task.threadId,
    runId: task.runId ?? task.taskId,
    summary: task.summary ?? task.taskId,
    status: task.status,
  };
}

export function summarizeApprovedAction(summary: string, workspaceRoot: string, requestPath?: string): string {
  if (!requestPath) {
    return summary;
  }

  const relativePath = isAbsolute(requestPath)
    ? relative(workspaceRoot, requestPath).replace(/\\/g, "/")
    : requestPath;

  if (summary.includes("delete_file")) {
    return `Deleted ${relativePath}`;
  }

  return summary;
}

export function resumeInputText(inputValue: string | ResumeControl): string {
  if (typeof inputValue === "string") {
    return inputValue;
  }

  if (inputValue.decision === "rejected") {
    return inputValue.reason ?? "";
  }

  return "";
}

export function canResetThreadCheckpoint(
  checkpointer: ResettableCheckpointerLike,
): checkpointer is ResettableCheckpointerLike & { deleteThread(threadId: string): Promise<void> } {
  return "deleteThread" in checkpointer && typeof checkpointer.deleteThread === "function";
}

export function resolveApprovalToolRequest(
  approval: ApprovalRequest | undefined,
  workspaceRoot: string,
): ToolExecuteRequest | undefined {
  if (!approval) {
    return undefined;
  }

  if (approval.toolRequest?.toolName) {
    return {
      toolCallId: approval.toolRequest.toolCallId,
      threadId: approval.toolRequest.threadId,
      runId: approval.toolRequest.runId,
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
    runId: approval.runId,
    taskId: approval.taskId,
    toolName: "apply_patch",
    args: {},
    action: "delete_file",
    path: resolve(workspaceRoot, relativePath),
    changedFiles: 1,
  };
}

function formatPromptSection(title: string, lines: string[]): string {
  if (lines.length === 0) {
    return "";
  }

  return `${title}:\n${lines.map((line) => `- ${line}`).join("\n")}`;
}

export function buildResponderPrompt(input: { text: string; threadView?: Thread }): string {
  const sections = [`Current user request: ${input.text}`];
  const threadSummary = input.threadView?.narrativeState?.threadSummary?.trim();
  if (threadSummary) {
    sections.push(`Thread summary:\n${threadSummary}`);
  }

  const taskSummaries = input.threadView?.narrativeState?.taskSummaries?.filter(Boolean) ?? [];
  const notableEvents = input.threadView?.narrativeState?.notableEvents?.filter(Boolean) ?? [];
  const workingMessages = input.threadView?.workingSetWindow?.messages?.filter(Boolean) ?? [];
  const retrievedMemories = input.threadView?.workingSetWindow?.retrievedMemories?.filter(Boolean) ?? [];
  const latestAnswer = input.threadView?.recoveryFacts?.latestDurableAnswer?.summary?.trim();

  const narrativeSection = formatPromptSection("Recent task summaries", taskSummaries);
  if (narrativeSection) {
    sections.push(narrativeSection);
  }

  const notableSection = formatPromptSection("Notable events", notableEvents);
  if (notableSection) {
    sections.push(notableSection);
  }

  const workingSection = formatPromptSection("Recent working messages", workingMessages);
  if (workingSection) {
    sections.push(workingSection);
  }

  const memorySection = formatPromptSection("Retrieved memories", retrievedMemories);
  if (memorySection) {
    sections.push(memorySection);
  }

  if (latestAnswer) {
    sections.push(`Latest durable answer:\n- ${latestAnswer}`);
  }

  return sections.join("\n\n");
}

export function isCancelledError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "kind" in error
    && (error as ModelGatewayError).kind === "cancelled_error";
}
