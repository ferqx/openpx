/**
 * @module harness/core/events/event-bus
 * harness 事件总线（event bus）。
 *
 * 这是 harness core 内部用于发布与订阅会话事件的基础原语。
 * 它承接 thread 启动、中断、投影视图更新以及流式事件转发，
 * 供 session kernel、thread 服务与 surface 适配层协作使用。
 */
import type { StreamEvent } from "../../../domain/stream-events";
import type { Thread } from "../../../domain/thread";
import type { ThreadMode } from "../../../control/agents/thread-mode";
import type { AgentRunView } from "../../protocol/views/agent-run-view";
import type { ProjectedSessionResult } from "../projection/session-view-projector";
import type { ModelGatewayEvent, ModelStatus } from "../../../infra/model-gateway";

/** 协作线启动事件。 */
export type ThreadStartedKernelEvent = {
  type: "thread.started";
  payload: Thread;
};

/** 协作线中断事件。 */
export type ThreadInterruptedKernelEvent = {
  type: "thread.interrupted";
  payload: {
    threadId: string;
    reason?: string;
  };
};

/** 协作线模式切换事件。 */
export type ThreadModeChangedKernelEvent = {
  type: "thread.mode_changed";
  payload: {
    threadId: string;
    fromMode: ThreadMode;
    toMode: ThreadMode;
    trigger: "slash_command" | "plain_input" | "runtime_command" | "compat_plan_task";
    reason?: string;
  };
};

/** 会话投影视图更新事件。 */
export type ThreadViewUpdatedKernelEvent = {
  type: "thread.view_updated";
  payload: ProjectedSessionResult;
};

/** 人工恢复已解除事件。 */
export type ThreadRecoveryResolvedKernelEvent = {
  type: "thread.recovery_resolved";
  payload: {
    threadId: string;
    action: "restart_run" | "resubmit_intent" | "abandon_run";
  };
};

/** run-loop 生命周期事件。 */
export type LoopKernelEvent = {
  type:
    | "loop.step_started"
    | "loop.step_completed"
    | "loop.step_failed"
    | "loop.suspended"
    | "loop.resumed"
    | "loop.finished";
  payload: {
    threadId: string;
    runId: string;
    taskId: string;
    step: "plan" | "execute" | "verify" | "respond" | "waiting_approval" | "waiting_plan_decision" | "done";
    suspensionId?: string;
    continuationId?: string;
    approvalRequestId?: string;
    resumeDisposition?: "resumed" | "already_resolved" | "already_consumed" | "invalidated" | "not_resumable";
    failureReason?: string;
    stateVersion?: number;
    engineVersion?: string;
  };
};

/** 任务失败事件。 */
export type TaskFailedKernelEvent = {
  type: "task.failed";
  payload: {
    threadId: string;
    error: string;
  };
};

/** agent run 生命周期事件。 */
export type AgentRunKernelEvent = {
  type:
    | "agent_run.spawned"
    | "agent_run.inspected"
    | "agent_run.resumed"
    | "agent_run.cancelled"
    | "agent_run.completed"
    | "agent_run.failed";
  payload: {
    agentRun: AgentRunView;
  };
};

/** 模型状态变更事件。 */
export type ModelStatusKernelEvent = {
  type: "model.status";
  payload: {
    status: ModelStatus;
  };
};

/** harness core 暴露给内核边界的统一事件类型。 */
export type KernelEvent =
  | ThreadStartedKernelEvent
  | ThreadInterruptedKernelEvent
  | ThreadModeChangedKernelEvent
  | ThreadViewUpdatedKernelEvent
  | ThreadRecoveryResolvedKernelEvent
  | LoopKernelEvent
  | TaskFailedKernelEvent
  | AgentRunKernelEvent
  | ModelStatusKernelEvent
  | ModelGatewayEvent;

type StreamKernelEvent = {
  type: StreamEvent["type"];
  payload: StreamEvent["payload"];
};

export type EventHandler<TEvent extends KernelEvent = KernelEvent> = (event: TEvent) => void;
export type StreamEventHandler = (event: StreamKernelEvent) => void;

/** 创建 harness 事件总线实例。 */
export function createEventBus<TEvent extends KernelEvent = KernelEvent>() {
  const handlers = new Set<EventHandler<TEvent>>();
  const streamHandlers = new Set<StreamEventHandler>();

  return {
    /** 发布内核事件。 */
    publish(event: TEvent) {
      handlers.forEach((handler) => handler(event));
    },
    /** 转发模型流式事件。 */
    publishStream(event: StreamEvent) {
      const kernelEvent: StreamKernelEvent = {
        type: event.type,
        payload: event.payload,
      };
      streamHandlers.forEach((handler) => handler(kernelEvent));
    },
    /** 订阅内核事件。 */
    subscribe(handler: EventHandler<TEvent>) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    /** 订阅流式事件。 */
    subscribeStream(handler: StreamEventHandler) {
      streamHandlers.add(handler);
      return () => {
        streamHandlers.delete(handler);
      };
    },
  };
}
