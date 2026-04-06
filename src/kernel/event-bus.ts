import type { StreamEvent } from "../domain/stream-events";
import type { Thread } from "../domain/thread";
import type { ProjectedSessionResult } from "./session-view-projector";
import type { ModelGatewayEvent, ModelStatus } from "../infra/model-gateway";

export type ThreadStartedKernelEvent = {
  type: "thread.started";
  payload: Thread;
};

export type ThreadInterruptedKernelEvent = {
  type: "thread.interrupted";
  payload: {
    threadId: string;
    reason?: string;
  };
};

export type ThreadViewUpdatedKernelEvent = {
  type: "thread.view_updated";
  payload: ProjectedSessionResult;
};

export type TaskFailedKernelEvent = {
  type: "task.failed";
  payload: {
    threadId: string;
    error: string;
  };
};

export type ModelStatusKernelEvent = {
  type: "model.status";
  payload: {
    status: ModelStatus;
  };
};

export type KernelEvent =
  | ThreadStartedKernelEvent
  | ThreadInterruptedKernelEvent
  | ThreadViewUpdatedKernelEvent
  | TaskFailedKernelEvent
  | ModelStatusKernelEvent
  | ModelGatewayEvent;

type StreamKernelEvent = {
  type: StreamEvent["type"];
  payload: StreamEvent["payload"];
};

export type EventHandler<TEvent extends KernelEvent = KernelEvent> = (event: TEvent) => void;
export type StreamEventHandler = (event: StreamKernelEvent) => void;

export function createEventBus<TEvent extends KernelEvent = KernelEvent>() {
  const handlers = new Set<EventHandler<TEvent>>();
  const streamHandlers = new Set<StreamEventHandler>();

  return {
    publish(event: TEvent) {
      handlers.forEach((handler) => handler(event));
    },
    publishStream(event: StreamEvent) {
      const kernelEvent: StreamKernelEvent = {
        type: event.type,
        payload: event.payload,
      };
      streamHandlers.forEach((handler) => handler(kernelEvent));
    },
    subscribe(handler: EventHandler<TEvent>) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    subscribeStream(handler: StreamEventHandler) {
      streamHandlers.add(handler);
      return () => {
        streamHandlers.delete(handler);
      };
    },
  };
}
