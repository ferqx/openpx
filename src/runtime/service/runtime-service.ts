import { createAppContext } from "../../app/bootstrap";
import { type RuntimeCommand, type RuntimeEventEnvelope, type RuntimeSnapshot } from "./runtime-types";
import { normalizeScope, scopeKey, type RuntimeScope, type RuntimeServiceOptions } from "./runtime-scope";
import { RuntimeScopedSession } from "./runtime-scoped-session";
import type { SessionCommandResult } from "../../kernel/session-kernel";

export type { RuntimeScope, RuntimeServiceOptions } from "./runtime-scope";

export interface RuntimeService {
  getSnapshot(scope?: RuntimeScope): Promise<RuntimeSnapshot>;
  handleCommand(command: RuntimeCommand, scope?: RuntimeScope): Promise<SessionCommandResult>;
  subscribeEvents(scope?: RuntimeScope | number, afterSeq?: number): AsyncIterable<RuntimeEventEnvelope>;
}

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
    const scope = typeof scopeOrAfterSeq === "number" ? undefined : scopeOrAfterSeq;
    const seq = typeof scopeOrAfterSeq === "number" ? scopeOrAfterSeq : afterSeq;
    yield* (await this.getScopedRuntime(this.getScope(scope))).subscribeEvents(seq);
  }
}

export async function createRuntimeService(options: RuntimeServiceOptions): Promise<RuntimeService> {
  return new DeviceRuntimeService(options);
}
