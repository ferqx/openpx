import { isAbsolute, relative, resolve } from "node:path";
import type { ApprovalRequest } from "../domain/approval";
import type { Thread } from "../domain/thread";
import type { ModelGatewayError } from "../infra/model-gateway";
import type { ThreadStorePort } from "../persistence/ports/thread-store-port";
import type { TaskStorePort } from "../persistence/ports/task-store-port";
import type { VerificationReport } from "../runtime/graph/root/context";
import type { ArtifactRecord } from "../runtime/artifacts/artifact-index";
import type { PlannerResult } from "../runtime/planning/planner-result";
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
      path: approval.toolRequest.path
        ? resolve(workspaceRoot, approval.toolRequest.path)
        : undefined,
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

function formatRecentTranscript(input: { threadView?: Thread; limit?: number }): string | undefined {
  const recentTranscript = (input.threadView?.recoveryFacts?.conversationHistory ?? [])
    .filter((message) => message.content.trim().length > 0)
    .slice(-(input.limit ?? 8));

  if (recentTranscript.length === 0) {
    return undefined;
  }

  return recentTranscript
    .map((message) => `- ${message.role}: ${message.content}`)
    .join("\n");
}

export function buildPlannerPrompt(input: {
  text: string;
  threadView?: Thread;
  projectMemory?: string[];
}): string {
  const sections = [`User request: ${input.text}`];
  const projectMemorySection = formatPromptSection("Project Memory", input.projectMemory ?? []);
  if (projectMemorySection) {
    sections.push(projectMemorySection);
  }

  const threadSummary = input.threadView?.narrativeState?.threadSummary?.trim();
  if (threadSummary) {
    sections.push(`Thread summary:\n${threadSummary}`);
  }

  const recentTranscript = formatRecentTranscript({ threadView: input.threadView, limit: 8 });
  if (recentTranscript) {
    sections.push(`Recent conversation transcript:\n${recentTranscript}`);
  }

  const latestAnswer = input.threadView?.recoveryFacts?.latestDurableAnswer?.summary?.trim();
  if (latestAnswer) {
    sections.push(`Latest durable answer:\n- ${latestAnswer}`);
  }

  sections.push(
    [
      "Decide the next step using the recent conversation as authoritative context.",
      "If the user is having a normal conversation or asking a direct question that can be answered from the conversation context, prefer a respond_only plan instead of inventing code work.",
    ].join("\n"),
  );

  return sections.join("\n\n");
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

  const recentTranscript = formatRecentTranscript({ threadView: input.threadView, limit: 8 });
  if (recentTranscript) {
    sections.push(`Recent conversation transcript:\n${recentTranscript}`);
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

export function buildFinalResponderPrompt(input: {
  text: string;
  threadView?: Thread;
  artifacts?: ArtifactRecord[];
  plannerResult?: PlannerResult;
  verificationReport?: VerificationReport;
}): string {
  const sections = [
    buildResponderPrompt({ text: input.text, threadView: input.threadView }),
  ];

  const workPackages = input.plannerResult?.workPackages ?? [];
  if (workPackages.length > 0) {
    sections.push(
      `Work packages:\n${workPackages.map((item) => `- ${item.id}: ${item.objective}`).join("\n")}`,
    );
  }

  const artifacts = input.artifacts ?? [];
  if (artifacts.length > 0) {
    sections.push(
      `Completed artifacts:\n${artifacts.map((artifact) => `- ${artifact.ref}: ${artifact.summary}`).join("\n")}`,
    );
  }

  if (input.verificationReport) {
    const verificationLines = [
      `- passed: ${input.verificationReport.passed === false ? "false" : "true"}`,
      `- summary: ${input.verificationReport.summary}`,
      input.verificationReport.feedback ? `- feedback: ${input.verificationReport.feedback}` : undefined,
    ].filter((line): line is string => Boolean(line));
    sections.push(`Verification report:\n${verificationLines.join("\n")}`);
  }

  sections.push(
    [
      "Compose the final user-facing response in Chinese unless the user clearly asked for another language.",
      "Treat the recent conversation transcript as authoritative context for identity, prior answers, and follow-up questions.",
      "If the user asks a conversational follow-up such as recalling a name, answer from the transcript instead of restarting with a generic greeting.",
      "Only summarize the durable final outcome; do not present verification, approval, or execution notes as separate final answers.",
      "Be concise and mention important changed artifacts when they are known.",
    ].join("\n"),
  );

  return sections.filter((section) => section.trim().length > 0).join("\n\n");
}

export function isCancelledError(error: unknown): boolean {
  // 与 harness/core/run/session-background-runner 保持同一取消语义，
  // 让 control-plane 可以把模型主动取消视为正常结束路径。
  return typeof error === "object"
    && error !== null
    && "kind" in error
    && (error as ModelGatewayError).kind === "cancelled_error";
}
