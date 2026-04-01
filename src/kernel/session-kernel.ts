import { createCommandBus } from "./command-bus";
import { createEventBus, type KernelEvent } from "./event-bus";
import { createInterruptService } from "./interrupt-service";
import { createThreadService } from "./thread-service";
import type { ThreadStorePort } from "../persistence/ports/thread-store-port";

export type SubmitInputCommand = {
  type: "submit_input";
  payload: {
    text: string;
  };
};

export type SessionCommand = SubmitInputCommand;

export type SessionKernel = {
  events: ReturnType<typeof createEventBus<KernelEvent>>;
  interrupts: ReturnType<typeof createInterruptService<KernelEvent>>;
  handleCommand: (command: SessionCommand) => Promise<void>;
};

export function createSessionKernel(deps: {
  stores: {
    threadStore: ThreadStorePort;
  };
  controlPlane: {
    startRootTask: (threadId: string, text: string) => Promise<void>;
  };
}): SessionKernel {
  const events = createEventBus<KernelEvent>();
  const commands = createCommandBus<SessionCommand>();
  const threadService = createThreadService({
    threadStore: deps.stores.threadStore,
    events,
  });
  const interrupts = createInterruptService({ events });

  commands.register("submit_input", async (command) => {
    const thread = await threadService.startThread();
    await deps.controlPlane.startRootTask(thread.threadId, command.payload.text);
  });

  return {
    events,
    interrupts,
    async handleCommand(command) {
      await commands.dispatch(command);
    },
  };
}
