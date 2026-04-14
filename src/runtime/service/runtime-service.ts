import { createAppContext } from "../../app/bootstrap";
import { type RuntimeCommand, type RuntimeEventEnvelope, type RuntimeSnapshot } from "./runtime-types";
import { normalizeScope, scopeKey, type RuntimeScope, type RuntimeServiceOptions } from "./runtime-scope";
import { RuntimeScopedSession } from "./runtime-scoped-session";
import type { SessionCommandResult } from "../../kernel/session-kernel";

export type { RuntimeScope, RuntimeServiceOptions } from "./runtime-scope";

/** runtime service 对外暴露的最小协议：快照、命令和事件流 */
export interface RuntimeService {
  getSnapshot(scope?: RuntimeScope): Promise<RuntimeSnapshot>;
  handleCommand(command: RuntimeCommand, scope?: RuntimeScope): Promise<SessionCommandResult>;
  subscribeEvents(scope?: RuntimeScope | number, afterSeq?: number): AsyncIterable<RuntimeEventEnvelope>;
}

/** 设备内 runtime 服务：为每个 scope 懒创建并缓存一个 RuntimeScopedSession */
class DeviceRuntimeService implements RuntimeService {
  private readonly runtimes = new Map<string, Promise<RuntimeScopedSession>>();
  private readonly defaultScope: RuntimeScope;

  constructor(private readonly options: RuntimeServiceOptions) {
    this.defaultScope = normalizeScope(options);
  }

  private getScope(scope?: RuntimeScope): RuntimeScope {
    return scope ?? this.defaultScope;
  }

  private getScopedRuntime(scope: RuntimeScope): Promise<RuntimeScopedSession> {
    const key = scopeKey(scope);
    const existing = this.runtimes.get(key);
    if (existing) {
      return existing;
    }

    // 为每个 workspace/project 对缓存一个 scoped runtime session。
    // 这里缓存 Promise 本身，而不是最终实例，避免并发首访时重复创建 AppContext。
    const created = createAppContext({
      dataDir: this.options.dataDir,
      workspaceRoot: scope.workspaceRoot,
      projectId: scope.projectId,
    }).then((context) => new RuntimeScopedSession(scope, context));
    this.runtimes.set(key, created);
    return created;
  }

  async getSnapshot(scope?: RuntimeScope): Promise<RuntimeSnapshot> {
    return (await this.getScopedRuntime(this.getScope(scope))).getSnapshot();
  }

  async handleCommand(command: RuntimeCommand, scope?: RuntimeScope): Promise<SessionCommandResult> {
    return (await this.getScopedRuntime(this.getScope(scope))).handleCommand(command);
  }

  async *subscribeEvents(scopeOrAfterSeq?: RuntimeScope | number, afterSeq?: number): AsyncIterable<RuntimeEventEnvelope> {
    // 兼容两种调用形式：
    // subscribeEvents(afterSeq)
    // subscribeEvents(scope, afterSeq)
    const scope = typeof scopeOrAfterSeq === "number" ? undefined : scopeOrAfterSeq;
    const seq = typeof scopeOrAfterSeq === "number" ? scopeOrAfterSeq : afterSeq;
    yield* (await this.getScopedRuntime(this.getScope(scope))).subscribeEvents(seq);
  }
}

/** 创建 runtime service；当前实现始终返回单机内缓存的 DeviceRuntimeService */
export async function createRuntimeService(options: RuntimeServiceOptions): Promise<RuntimeService> {
  return new DeviceRuntimeService(options);
}
