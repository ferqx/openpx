/** 
 * @module kernel/session-result-applicator
 * 会话结果应用器（session result applicator）。
 * 
 * 负责将控制面返回的执行结果应用到协作线和运行状态上，
 * 包括状态转换、版本递增和持久化保存。
 * 
 * 术语对照：session=会话，result=结果，applicator=应用器，
 * thread=协作线，run=执行尝试
 */
import type { Task } from "../domain/task";
import type { Thread } from "../domain/thread";
import type { ThreadNarrativeService } from "../control/context/thread-narrative-service";
import { createThreadStateProjector } from "../control/context/thread-state-projector";
import type { DerivedThreadView } from "../control/context/thread-compaction-types";
import { createControlTask } from "../control/tasks/task-types";
import { prefixedUuid } from "../shared/id-generators";
import type { SessionControlPlaneResult } from "./session-kernel";

function toControlTask(task: Task) {
  return createControlTask({
    taskId: task.taskId,
    threadId: task.threadId,
    runId: task.runId,
    summary: task.summary ?? task.taskId,
    status: task.status,
    blockingReason: task.blockingReason,
  });
}

export async function applySessionControlPlaneResult(input: {
  thread: Thread;
  result: SessionControlPlaneResult;
  narrativeService?: ThreadNarrativeService;
  saveThread: (thread: Thread) => Promise<void>;
}): Promise<Thread> {
  const projector = createThreadStateProjector();
  let view: DerivedThreadView = {
    recoveryFacts: input.thread.recoveryFacts,
    narrativeState: input.thread.narrativeState,
    workingSetWindow: input.thread.workingSetWindow,
  };

  const controlTask = toControlTask(input.result.task);
  view = projector.project(view, { kind: "task", task: controlTask });
  if (input.narrativeService) {
    await input.narrativeService.processTaskUpdate(controlTask);
  }

  for (const approval of input.result.approvals) {
    view = projector.project(view, { kind: "approval", approval });
  }

  view = projector.project(view, {
    kind: "transcript_message",
    messageId: prefixedUuid("msg"),
    role: "assistant",
    content: input.result.summary,
  });
  view = projector.project(view, {
    kind: "answer",
    answerId: prefixedUuid("ans"),
    summary: input.result.summary,
  });

  if (input.result.lastCompletedToolCallId) {
    view = projector.project(view, {
      kind: "tool_executed",
      toolCallId: input.result.lastCompletedToolCallId,
      toolName: input.result.lastCompletedToolName ?? "",
    });
  }

  if (input.result.pendingToolCallId) {
    view = projector.project(view, {
      kind: input.result.status === "waiting_approval" ? "tool_blocked" : "tool_pending",
      toolCallId: input.result.pendingToolCallId,
      toolName: input.result.pendingToolName ?? "",
    });
  }

  const nextThread: Thread = {
    ...input.thread,
    ...view,
    status: "active",
    revision: view.recoveryFacts?.revision ?? input.thread.revision ?? 1,
  };
  await input.saveThread(nextThread);
  return nextThread;
}
