/** 
 * @module kernel/command-bus
 * 命令总线（command bus）。
 * 
 * 提供类型安全的命令分发机制，将命令类型与处理器解耦。
 * 内核边界通过命令总线接收来自 TUI 或外部的操作指令，
 * 然后路由到已注册的处理器执行。
 * 
 * 术语对照：command bus=命令总线，handler=处理器，dispatch=分发
 */
/** 内核命令基础类型，所有命令必须包含 type 字段 */
export type KernelCommand = {
  type: string;           // 命令类型标识符
  payload?: unknown;      // 命令负载（可选）
};

/** 命令处理器——接收命令并异步执行 */
export type CommandHandler<TCommand extends KernelCommand> = (command: TCommand) => Promise<void>;

/** 创建命令总线实例，提供 register（注册）和 dispatch（分发）方法 */
export function createCommandBus<TCommand extends KernelCommand>() {
  // 命令类型到处理器的映射表
  const handlers = new Map<TCommand["type"], CommandHandler<TCommand>>();

  return {
    /** 注册命令处理器 */
    register(type: TCommand["type"], handler: CommandHandler<TCommand>) {
      handlers.set(type, handler);
    },
    /** 分发命令到已注册的处理器，未注册时抛出错误 */
    async dispatch(command: TCommand) {
      const handler = handlers.get(command.type);

      if (!handler) {
        // 未找到对应类型的处理器
        throw new Error(`no command handler registered for ${command.type}`);
      }

      await handler(command);
    },
  };
}
