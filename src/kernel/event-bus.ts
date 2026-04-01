export type KernelEvent = {
  type: string;
  payload?: unknown;
};

export type EventHandler<TEvent extends KernelEvent = KernelEvent> = (event: TEvent) => void;

export function createEventBus<TEvent extends KernelEvent = KernelEvent>() {
  const handlers = new Set<EventHandler<TEvent>>();

  return {
    publish(event: TEvent) {
      handlers.forEach((handler) => handler(event));
    },
    subscribe(handler: EventHandler<TEvent>) {
      handlers.add(handler);

      return () => {
        handlers.delete(handler);
      };
    },
  };
}
