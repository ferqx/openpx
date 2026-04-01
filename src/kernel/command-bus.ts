export type KernelCommand = {
  type: string;
  payload?: unknown;
};

export type CommandHandler<TCommand extends KernelCommand> = (command: TCommand) => Promise<void>;

export function createCommandBus<TCommand extends KernelCommand>() {
  const handlers = new Map<TCommand["type"], CommandHandler<TCommand>>();

  return {
    register(type: TCommand["type"], handler: CommandHandler<TCommand>) {
      handlers.set(type, handler);
    },
    async dispatch(command: TCommand) {
      const handler = handlers.get(command.type);

      if (!handler) {
        throw new Error(`no command handler registered for ${command.type}`);
      }

      await handler(command);
    },
  };
}
