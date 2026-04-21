import { createAppContext } from "../../../app/bootstrap";
import { createEvent } from "../../../domain/event";
import type { Run } from "../../../domain/run";
import { createThread, type Thread } from "../../../domain/thread";
import { transitionThread } from "../../../domain/thread";
import { DEFAULT_THREAD_MODE, type ThreadMode } from "../../../control/agents/thread-mode";
import type { HarnessSessionScope } from "../../server/harness-session-scope";
import type { RuntimeCommand } from "../../protocol/schemas/api-schema";
import type { SessionCommandResult } from "./session-kernel";
import { toAgentRunView, type AgentRunView } from "../../protocol/views/agent-run-view";

type AppContext = Awaited<ReturnType<typeof createAppContext>>;

/** harness 协议命令处理器依赖：负责 scope 校验、active thread 管理和上下文访问 */
type RuntimeCommandHandlerDeps = {
  scope: HarnessSessionScope;
  context: AppContext;
  ensureActiveThread: () => Promise<Thread>;
  touchThread: (thread: Thread, nextStatus?: Thread["status"]) => Promise<Thread>;
  setActiveThreadId: (threadId: string) => void;
};

/** 作用域键——用于报错与缓存命中时的人类可读标识 */
function scopeKey(scope: HarnessSessionScope): string {
  return `${scope.workspaceRoot}::${scope.projectId}`;
}

/** 当 scope 下还没有任何 thread 时，返回一份稳定的空会话结果 */
function createEmptySessionResult(scope: HarnessSessionScope): SessionCommandResult {
  return {
    threadId: "",
    threadMode: DEFAULT_THREAD_MODE,
    status: "completed",
    finalResponse: undefined,
    executionSummary: undefined,
    verificationSummary: undefined,
    pauseSummary: undefined,
    latestExecutionStatus: "completed",
    workspaceRoot: scope.workspaceRoot,
    projectId: scope.projectId,
    approvals: [],
    tasks: [],
    threads: [],
  };
}

/** 把底层 AgentRunRecord 裁成 protocol 层允许暴露的 AgentRunView。 */
function toAgentRunProtocolView(agentRun: {
  agentRunId: string;
  threadId: string;
  taskId: string;
  role: "planner" | "executor" | "verifier" | "memory_maintainer";
  status: AgentRunView["status"];
  spawnReason: string;
  startedAt?: string;
  endedAt?: string;
  resumeToken?: string;
}): AgentRunView {
  return toAgentRunView({
    agentRunId: agentRun.agentRunId,
    threadId: agentRun.threadId,
    taskId: agentRun.taskId,
    role: agentRun.role,
    status: agentRun.status,
    spawnReason: agentRun.spawnReason,
    startedAt: agentRun.startedAt,
    endedAt: agentRun.endedAt,
    resumeToken: agentRun.resumeToken,
  });
}

/** 只有 blocked / interrupted 的 run 才具备“继续执行”语义 */
function canResumeLatestRun(run: Run | undefined): boolean {
  return run?.status === "blocked" || run?.status === "interrupted";
}

/** 这些 run 状态允许从 TUI 发起 interrupt */
function canInterruptLatestRun(run: Run | undefined): boolean {
  return (
    run?.status === "created" ||
    run?.status === "running" ||
    run?.status === "waiting_approval" ||
    run?.status === "blocked" ||
    run?.status === "interrupted"
  );
}

export function createRuntimeCommandHandler(deps: RuntimeCommandHandlerDeps) {
  async function hydrateOrEmpty() {
    return (await deps.context.kernel.hydrateSession()) ?? createEmptySessionResult(deps.scope);
  }

  /** agentRunManager 是可选装配项；进入 agent_run 命令路径时再强校验。 */
  function getAgentRunManager() {
    const agentRunManager = deps.context.agentRunManager;
    if (!agentRunManager) {
      throw new Error("agent run manager is not configured for this runtime");
    }
    return agentRunManager;
  }

  async function getAgentRunThread(agentRunId: string): Promise<Thread | undefined> {
    const agentRun = await deps.context.stores.agentRunStore.get(agentRunId);
    if (!agentRun) {
      return undefined;
    }
    const thread = await deps.context.stores.threadStore.get(agentRun.threadId);
    if (!thread || thread.workspaceRoot !== deps.scope.workspaceRoot || thread.projectId !== deps.scope.projectId) {
      return undefined;
    }
    return thread;
  }

  async function appendRuntimeEvent(input: {
    threadId: string;
    type: string;
    payload: Record<string, unknown>;
  }) {
    if (!deps.context.stores.eventLog) {
      return;
    }

    await deps.context.stores.eventLog.append({
      ...createEvent({
        eventId: `event_${crypto.randomUUID()}`,
        threadId: input.threadId,
        type: input.type,
        payload: input.payload,
        createdAt: new Date().toISOString(),
      }),
    });
  }

  async function updateThreadMode(input: {
    thread: Thread;
    nextMode: ThreadMode;
    trigger: "slash_command" | "plain_input" | "runtime_command" | "compat_plan_task";
    reason?: string;
  }) {
    const fromMode = input.thread.threadMode;
    if (fromMode === input.nextMode) {
      return input.thread;
    }

    const nextThread: Thread = {
      ...input.thread,
      threadMode: input.nextMode,
      revision: (input.thread.revision ?? 1) + 1,
    };
    await deps.context.stores.threadStore.save(nextThread);

    const payload = {
      threadId: input.thread.threadId,
      fromMode,
      toMode: input.nextMode,
      trigger: input.trigger,
      reason: input.reason,
    };
    deps.context.kernel.events.publish({
      type: "thread.mode_changed",
      payload,
    });
    await appendRuntimeEvent({
      threadId: input.thread.threadId,
      type: "thread.mode_changed",
      payload,
    });

    return nextThread;
  }

  function publishAgentRunEvent(
    type: "agent_run.spawned" | "agent_run.inspected" | "agent_run.resumed" | "agent_run.cancelled" | "agent_run.completed" | "agent_run.failed",
    agentRun: AgentRunView,
  ) {
    deps.context.kernel.events.publish({
      type,
      payload: {
        agentRun,
      },
    });
  }

  return async function handleRuntimeCommand(command: RuntimeCommand): Promise<SessionCommandResult> {
    if (command.kind === "new_thread") {
      // 显式 new_thread 永远创建新的协作线，而不是复用现有 active thread。
      const thread = createThread(crypto.randomUUID(), deps.scope.workspaceRoot, deps.scope.projectId);
      await deps.touchThread(thread, "active");

      const result = await deps.context.kernel.hydrateSession();
      if (!result) throw new Error("failed to hydrate new thread");
      return result;
    }

    if (command.kind === "switch_thread" || command.kind === "continue") {
      const threadId = command.threadId;
      if (!threadId) {
        const result = await deps.context.kernel.hydrateSession();
        return result ?? createEmptySessionResult(deps.scope);
      }
      const thread = await deps.context.stores.threadStore.get(threadId);
      if (!thread || thread.workspaceRoot !== deps.scope.workspaceRoot || thread.projectId !== deps.scope.projectId) {
        throw new Error(`thread ${threadId} not found in scope ${scopeKey(deps.scope)}`);
      }
      const latestRun = await deps.context.stores.runStore.getLatestByThread(thread.threadId);

      const nextStatus =
        command.kind === "switch_thread"
          ? "active"
          : command.kind === "continue" && (canResumeLatestRun(latestRun) || thread.status === "idle")
            ? "active"
            : undefined;
      // continue 只在 thread 可继续时把它重新激活；否则保持原状，只返回当前快照。
      await deps.touchThread(thread, nextStatus);

      const result = await deps.context.kernel.hydrateSession();
      if (!result) throw new Error("failed to hydrate thread");
      return result;
    }

    if (
      command.kind === "restart_run"
      || command.kind === "abandon_run"
    ) {
      const thread = await deps.context.stores.threadStore.get(command.threadId);
      if (!thread || thread.workspaceRoot !== deps.scope.workspaceRoot || thread.projectId !== deps.scope.projectId) {
        throw new Error(`thread ${command.threadId} not found in scope ${scopeKey(deps.scope)}`);
      }

      await deps.touchThread(thread, "active");
      deps.setActiveThreadId(thread.threadId);

      if (command.kind === "restart_run") {
        return deps.context.kernel.handleCommand({
          type: "restart_run",
          payload: { threadId: thread.threadId },
        });
      }
      return deps.context.kernel.handleCommand({
        type: "abandon_run",
        payload: { threadId: thread.threadId },
      });
    }

    if (command.kind === "interrupt") {
      const threadId = command.threadId;
      if (!threadId) {
        const result = await deps.context.kernel.hydrateSession();
        return result ?? createEmptySessionResult(deps.scope);
      }
      const thread = await deps.context.stores.threadStore.get(threadId);
      if (!thread || thread.workspaceRoot !== deps.scope.workspaceRoot || thread.projectId !== deps.scope.projectId) {
        throw new Error(`thread ${threadId} not found in scope ${scopeKey(deps.scope)}`);
      }
      const latestRun = await deps.context.stores.runStore.getLatestByThread(thread.threadId);

      if (!canInterruptLatestRun(latestRun) && thread.status !== "active") {
        const result = await deps.context.kernel.hydrateSession();
        if (!result) {
          throw new Error("failed to hydrate interrupted thread");
        }
        return result;
      }

      const cancelled = await deps.context.controlPlane.cancelThread(thread.threadId, "Interrupted from TUI");
      if (!cancelled) {
        // control-plane 未真正取消时，仍把 thread 保持为 active，
        // 避免 UI 误以为当前 thread 已经被切走。
        await deps.touchThread(thread, "active");
      }
      await deps.context.kernel.interrupts.interruptThread(thread.threadId, "Interrupted from TUI");

      const result = await deps.context.kernel.hydrateSession();
      if (!result) {
        throw new Error("failed to hydrate interrupted thread");
      }
      return result;
    }

    if (command.kind === "set_thread_mode" || command.kind === "clear_thread_mode") {
      const thread = await deps.context.stores.threadStore.get(command.threadId);
      if (!thread || thread.workspaceRoot !== deps.scope.workspaceRoot || thread.projectId !== deps.scope.projectId) {
        throw new Error(`thread ${command.threadId} not found in scope ${scopeKey(deps.scope)}`);
      }

      await updateThreadMode({
        thread,
        nextMode: command.kind === "set_thread_mode" ? command.mode : DEFAULT_THREAD_MODE,
        trigger: command.trigger,
        reason: command.reason,
      });

      const result = await deps.context.kernel.hydrateSession();
      return result ?? createEmptySessionResult(deps.scope);
    }

    if (command.kind === "add_task") {
      // add_task 是 runtime protocol 到 kernel submit_input 的直接映射。
      await deps.ensureActiveThread();
      const result = await deps.context.kernel.handleCommand({
        type: "submit_input",
        payload: {
          text: command.content,
          background: command.background,
        },
      });
      deps.setActiveThreadId(result.threadId);
      return result;
    }

    if (command.kind === "plan_task") {
      // 兼容旧 plan_task：先把 thread truth 切到 plan，再沿普通提交路径进入 kernel。
      const thread = await deps.ensureActiveThread();
      await updateThreadMode({
        thread,
        nextMode: "plan",
        trigger: "compat_plan_task",
      });
      const result = await deps.context.kernel.handleCommand({
        type: "submit_input",
        payload: {
          text: command.content,
        },
      });
      deps.setActiveThreadId(result.threadId);
      return result;
    }

    if (command.kind === "agent_run_spawn") {
      const thread = command.threadId
        ? await deps.context.stores.threadStore.get(command.threadId)
        : await deps.ensureActiveThread();

      if (!thread || thread.workspaceRoot !== deps.scope.workspaceRoot || thread.projectId !== deps.scope.projectId) {
        throw new Error(`thread ${command.threadId ?? "<active>"} not found in scope ${scopeKey(deps.scope)}`);
      }

      const agentRunManager = getAgentRunManager();
      if (thread.status !== "active") {
        await deps.touchThread(transitionThread(thread, "active"));
      } else {
        await deps.touchThread(thread, "active");
      }

      const agentRun = await agentRunManager.spawn({
        threadId: thread.threadId,
        taskId: command.taskId,
        role: command.role,
        spawnReason: command.spawnReason,
        resumeToken: command.resumeToken,
      });
      deps.setActiveThreadId(thread.threadId);
      publishAgentRunEvent("agent_run.spawned", toAgentRunProtocolView(agentRun));

      return hydrateOrEmpty();
    }

    if (command.kind === "agent_run_inspect") {
      const thread = await getAgentRunThread(command.agentRunId);
      if (!thread) {
        throw new Error(`agent run ${command.agentRunId} not found in scope ${scopeKey(deps.scope)}`);
      }

      const agentRunManager = getAgentRunManager();
      await deps.touchThread(thread, "active");
      deps.setActiveThreadId(thread.threadId);
      const agentRun = await agentRunManager.inspect(command.agentRunId);
      if (!agentRun) {
        throw new Error(`agent run ${command.agentRunId} not found`);
      }
      publishAgentRunEvent("agent_run.inspected", toAgentRunProtocolView(agentRun));

      return hydrateOrEmpty();
    }

    if (command.kind === "agent_run_resume") {
      const thread = await getAgentRunThread(command.agentRunId);
      if (!thread) {
        throw new Error(`agent run ${command.agentRunId} not found in scope ${scopeKey(deps.scope)}`);
      }

      const agentRunManager = getAgentRunManager();
      await deps.touchThread(thread, "active");
      deps.setActiveThreadId(thread.threadId);
      const agentRun = await agentRunManager.resume(command.agentRunId);
      publishAgentRunEvent("agent_run.resumed", toAgentRunProtocolView(agentRun));

      return hydrateOrEmpty();
    }

    if (command.kind === "agent_run_cancel") {
      const thread = await getAgentRunThread(command.agentRunId);
      if (!thread) {
        throw new Error(`agent run ${command.agentRunId} not found in scope ${scopeKey(deps.scope)}`);
      }

      const agentRunManager = getAgentRunManager();
      await deps.touchThread(thread, "active");
      deps.setActiveThreadId(thread.threadId);
      const agentRun = await agentRunManager.cancel(command.agentRunId);
      publishAgentRunEvent(
        agentRun.status === "failed" ? "agent_run.failed" : "agent_run.cancelled",
        toAgentRunProtocolView(agentRun),
      );

      return hydrateOrEmpty();
    }

    if (command.kind === "agent_run_join") {
      const thread = await getAgentRunThread(command.agentRunId);
      if (!thread) {
        throw new Error(`agent run ${command.agentRunId} not found in scope ${scopeKey(deps.scope)}`);
      }

      await deps.touchThread(thread, "active");
      deps.setActiveThreadId(thread.threadId);
      const agentRun = await getAgentRunManager().join(command.agentRunId);
      publishAgentRunEvent(
        agentRun.status === "failed" ? "agent_run.failed" : "agent_run.completed",
        toAgentRunProtocolView(agentRun),
      );
      return hydrateOrEmpty();
    }

    if (command.kind === "approve") {
      return deps.context.kernel.handleCommand({
        type: "approve_request",
        payload: { approvalRequestId: command.approvalRequestId },
      });
    }

    if (command.kind === "reject") {
      return deps.context.kernel.handleCommand({
        type: "reject_request",
        payload: { approvalRequestId: command.approvalRequestId },
      });
    }

    if (command.kind === "resolve_approval") {
      if (command.decision === "approved") {
        return deps.context.kernel.handleCommand({
          type: "approve_request",
          payload: { approvalRequestId: command.approvalRequestId },
        });
      }

      return deps.context.kernel.handleCommand({
        type: "reject_request",
        payload: { approvalRequestId: command.approvalRequestId },
      });
    }

    if (command.kind === "resolve_plan_decision") {
      const thread = await deps.context.stores.threadStore.get(command.threadId);
      if (!thread || thread.workspaceRoot !== deps.scope.workspaceRoot || thread.projectId !== deps.scope.projectId) {
        throw new Error(`thread ${command.threadId} not found in scope ${scopeKey(deps.scope)}`);
      }

      await deps.touchThread(thread, "active");
      deps.setActiveThreadId(thread.threadId);
      return deps.context.kernel.handleCommand({
        type: "resolve_plan_decision",
        payload: {
          threadId: thread.threadId,
          runId: command.runId,
          optionId: command.optionId,
          optionLabel: command.optionLabel,
          input: command.input,
        },
      });
    }

    throw new Error("command not implemented");
  };
}
