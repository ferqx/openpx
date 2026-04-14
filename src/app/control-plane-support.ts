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

/** control-plane 常用存储组合：这里只依赖 task/thread 两个最小写入面 */
type ControlPlaneStores = {
  taskStore: TaskStorePort;
  threadStore: ThreadStorePort;
};

/** 允许删除 checkpoint 的最小接口，用于兼容不同实现 */
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
  // 只有任务走到边界状态时才触发压缩，避免 running 态频繁重写 narrative /
  // working set，造成 thread 视图抖动和无意义的持久化开销。
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
  // 一些旧路径或投影结果未必带完整 ControlTask 字段；
  // 这里把最小 task 形状补齐，确保 control-plane 后续逻辑稳定可用。
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

  // 审批摘要最终会直接回到 UI；优先把绝对路径转换成 workspace 相对路径，
  // 避免把宿主机路径暴露到面向用户的结果摘要里。
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

  // structured resume 不总是带自然语言输入：
  // approval approved 依赖 graph 从 checkpoint 恢复，reject 则需要把拒绝原因回送给 planner。
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
    // 新格式审批直接持有结构化 tool request，可无损恢复执行。
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

  // 兼容旧审批记录：当历史数据只剩 summary 时，尽量恢复出最小 delete_file 请求。
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

  // responder prompt 只注入“压缩后仍值得保留”的事实层信息，
  // 避免把整条 thread 原样塞回模型上下文。
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
  // 与 kernel/session-background-runner 保持同一取消语义，
  // 让 control-plane 可以把模型主动取消视为正常结束路径。
  return typeof error === "object"
    && error !== null
    && "kind" in error
    && (error as ModelGatewayError).kind === "cancelled_error";
}
