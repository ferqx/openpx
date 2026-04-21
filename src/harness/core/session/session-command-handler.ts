/**
 * @module harness/core/session/session-command-handler
 * 会话命令处理器（session command handler）。
 *
 * 负责解析和分发 surface 发来的用户操作命令（提交输入、审批、拒绝等），
 * 确定目标协作线和运行状态，并协调控制面推进执行。
 *
 * 术语对照：session=会话，command=命令，thread=协作线，
 * approval=审批，submit=提交
 */
import type { ApprovalRequest } from "../../../domain/approval";
import type { Run } from "../../../domain/run";
import type { Task } from "../../../domain/task";
import { transitionThread, type Thread } from "../../../domain/thread";
import type { DerivedThreadView } from "../../../control/context/thread-compaction-types";

/** 协作线活动上下文——包含当前步骤和审批列表 */
type ThreadActivityContext = {
  tasks: Task[];
  approvals: ApprovalRequest[];
};

/** 解析后的提交命令上下文 */
export type ResolvedSubmitCommandContext = ThreadActivityContext & {
  thread: Thread;
  latestRun?: Run | undefined;
  startedNewThread: boolean;
};

/** 解析后的审批命令上下文 */
export type ResolvedApprovalCommandContext = ThreadActivityContext & {
  approval: ApprovalRequest;
  thread: Thread;
  latestRun?: Run | undefined;
};

/** 解析提交命令的目标协作线——确定是复用现有协作线还是创建新的 */
export async function resolveSubmitTargetThread(input: {
  latestThread: Thread | undefined;
  latestRun?: Run | undefined;
  expectedRevision: number | undefined;
  startThread: () => Promise<Thread>;
  saveThread: (thread: Thread) => Promise<void>;
  ensureRevision: (threadId: string, expectedRevision: number | undefined) => Promise<void>;
}): Promise<{ thread: Thread; startedNewThread: boolean }> {
  const { latestThread, latestRun } = input;

  if (!latestThread || latestRun?.status === "failed" || latestThread.status === "archived") {
    return {
      thread: await input.startThread(),
      startedNewThread: true,
    };
  }

  await input.ensureRevision(latestThread.threadId, input.expectedRevision);

  if (latestThread.status !== "active") {
    const activeThread = transitionThread(latestThread, "active");
    await input.saveThread(activeThread);
    return {
      thread: activeThread,
      startedNewThread: false,
    };
  }

  return {
    thread: latestThread,
    startedNewThread: false,
  };
}

export function hasDurableBlockingState(input: {
  thread: { recoveryFacts?: DerivedThreadView["recoveryFacts"] };
  tasks: Task[];
}): boolean {
  if (input.thread.recoveryFacts?.blocking) {
    return true;
  }

  return input.tasks.some((task) => task.status === "blocked" && task.blockingReason);
}

export function shouldShortCircuitBlockedSubmit(input: {
  latestRun?: Run | undefined;
  thread: { recoveryFacts?: DerivedThreadView["recoveryFacts"] };
  tasks: Task[];
}): boolean {
  // blocked 短路已移除：用户输入直接提交，不再因 blocked 状态被拦截。
  // hasDurableBlockingState 保留供日志和审计判断使用。
  return false;
}

/** 解析审批命令的目标协作线——确保审批请求存在并返回上下文 */
export async function resolveApprovalTargetThread(input: {
  approval: ApprovalRequest | undefined;
  getThread: (threadId: string) => Promise<Thread | undefined>;
  getLatestRunByThread: (threadId: string) => Promise<Run | undefined>;
}): Promise<{
  approval: ApprovalRequest;
  thread: Thread;
  latestRun?: Run | undefined;
}> {
  if (!input.approval) {
    throw new Error("approval request not found");
  }

  const thread = await input.getThread(input.approval.threadId);
  if (!thread) {
    throw new Error(`Thread ${input.approval.threadId} not found for approval`);
  }

  return {
    approval: input.approval,
    thread,
    latestRun: await input.getLatestRunByThread(thread.threadId),
  };
}

async function loadThreadActivityContext(input: {
  threadId: string;
  listTasksByThread: (threadId: string) => Promise<Task[]>;
  listPendingApprovalsByThread: (threadId: string) => Promise<ApprovalRequest[]>;
}): Promise<ThreadActivityContext> {
  const [tasks, approvals] = await Promise.all([
    input.listTasksByThread(input.threadId),
    input.listPendingApprovalsByThread(input.threadId),
  ]);

  return { tasks, approvals };
}

export async function resolveSubmitCommandContext(input: {
  latestThread: Thread | undefined;
  expectedRevision: number | undefined;
  getLatestRunByThread: (threadId: string) => Promise<Run | undefined>;
  listTasksByThread: (threadId: string) => Promise<Task[]>;
  listPendingApprovalsByThread: (threadId: string) => Promise<ApprovalRequest[]>;
  startThread: () => Promise<Thread>;
  saveThread: (thread: Thread) => Promise<void>;
  ensureRevision: (threadId: string, expectedRevision: number | undefined) => Promise<void>;
}): Promise<ResolvedSubmitCommandContext> {
  const latestRun = input.latestThread
    ? await input.getLatestRunByThread(input.latestThread.threadId)
    : undefined;
  const target = await resolveSubmitTargetThread({
    latestThread: input.latestThread,
    latestRun,
    expectedRevision: input.expectedRevision,
    startThread: input.startThread,
    saveThread: input.saveThread,
    ensureRevision: input.ensureRevision,
  });
  const activity = await loadThreadActivityContext({
    threadId: target.thread.threadId,
    listTasksByThread: input.listTasksByThread,
    listPendingApprovalsByThread: input.listPendingApprovalsByThread,
  });

  return {
    thread: target.thread,
    latestRun,
    startedNewThread: target.startedNewThread,
    ...activity,
  };
}

export async function resolveApprovalCommandContext(input: {
  approvalRequestId: string;
  getApproval: (approvalRequestId: string) => Promise<ApprovalRequest | undefined>;
  getThread: (threadId: string) => Promise<Thread | undefined>;
  getLatestRunByThread: (threadId: string) => Promise<Run | undefined>;
  listTasksByThread: (threadId: string) => Promise<Task[]>;
  listPendingApprovalsByThread: (threadId: string) => Promise<ApprovalRequest[]>;
}): Promise<ResolvedApprovalCommandContext> {
  const target = await resolveApprovalTargetThread({
    approval: await input.getApproval(input.approvalRequestId),
    getThread: input.getThread,
    getLatestRunByThread: input.getLatestRunByThread,
  });
  const activity = await loadThreadActivityContext({
    threadId: target.thread.threadId,
    listTasksByThread: input.listTasksByThread,
    listPendingApprovalsByThread: input.listPendingApprovalsByThread,
  });

  return {
    ...target,
    ...activity,
  };
}
