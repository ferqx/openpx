import { useEffect, useState } from "react";
import { parseCommand, type ApprovalCommand, type SubmitInputCommand } from "../commands";

export type TuiKernelEvent = {
  type: string;
  payload?: unknown;
};

export type TuiKernel = {
  events: {
    subscribe: (handler: (event: TuiKernelEvent) => void) => () => void;
  };
  handleCommand: (command: SubmitInputCommand | ApprovalCommand) => Promise<unknown>;
  hydrateSession?: () => Promise<unknown>;
};

export function useKernel(kernel: TuiKernel) {
  const [events, setEvents] = useState<TuiKernelEvent[]>([]);

  useEffect(() => {
    return kernel.events.subscribe((event) => {
      setEvents((current) => [...current, event]);
    });
  }, [kernel]);

  async function submit(text: string) {
    const value = text.trim();
    if (!value) {
      return;
    }

    await kernel.handleCommand(parseCommand(value));
  }

  return {
    events,
    submit,
  };
}
