import { createAppContext } from "../../app/bootstrap";
import { HarnessSession } from "../../harness/core/session/harness-session";
import type { SessionCommandResult } from "../../harness/core/session/session-kernel";
import type { RuntimeCommand, RuntimeEventEnvelope, RuntimeSnapshot } from "../protocol/schemas/api-schema";
import {
  harnessSessionScopeKey,
  normalizeHarnessSessionScope,
  type HarnessSessionRegistryOptions,
  type HarnessSessionScope,
} from "./harness-session-scope";

export type { HarnessSessionRegistryOptions, HarnessSessionScope } from "./harness-session-scope";

/**
 * harness session registry 对外暴露的最小能力：
 * snapshot、command 和 event stream。
 *
 * 它负责：
 * - 按 scope 复用或创建 HarnessSession
 * - 作为 app server 的 session host
 * - 为 surface 提供稳定的 session 访问入口
 */
export interface HarnessSessionRegistry {
  getSnapshot(scope?: HarnessSessionScope): Promise<RuntimeSnapshot>;
  handleCommand(command: RuntimeCommand, scope?: HarnessSessionScope): Promise<SessionCommandResult>;
  subscribeEvents(scope?: HarnessSessionScope | number, afterSeq?: number): AsyncIterable<RuntimeEventEnvelope>;
}

/** 单机内 harness session registry：为每个 scope 懒创建并缓存一个 HarnessSession。 */
class DeviceHarnessSessionRegistry implements HarnessSessionRegistry {
  private readonly sessions = new Map<string, Promise<HarnessSession>>();
  private readonly defaultScope: HarnessSessionScope;

  constructor(private readonly options: HarnessSessionRegistryOptions) {
    this.defaultScope = normalizeHarnessSessionScope(options);
  }

  private getScope(scope?: HarnessSessionScope): HarnessSessionScope {
    return scope ?? this.defaultScope;
  }

  private getScopedSession(scope: HarnessSessionScope): Promise<HarnessSession> {
    const key = harnessSessionScopeKey(scope);
    const existing = this.sessions.get(key);
    if (existing) {
      return existing;
    }

    // 为每个 workspace/project 对缓存一个 scoped harness session。
    // 这里缓存 Promise 本身，而不是最终实例，避免并发首访时重复创建 AppContext。
    const created = createAppContext({
      dataDir: this.options.dataDir,
      workspaceRoot: scope.workspaceRoot,
      projectId: scope.projectId,
    }).then((context) => new HarnessSession(scope, context));
    this.sessions.set(key, created);
    return created;
  }

  async getSnapshot(scope?: HarnessSessionScope): Promise<RuntimeSnapshot> {
    return (await this.getScopedSession(this.getScope(scope))).getSnapshot();
  }

  async handleCommand(command: RuntimeCommand, scope?: HarnessSessionScope): Promise<SessionCommandResult> {
    return (await this.getScopedSession(this.getScope(scope))).handleCommand(command);
  }

  async *subscribeEvents(
    scopeOrAfterSeq?: HarnessSessionScope | number,
    afterSeq?: number,
  ): AsyncIterable<RuntimeEventEnvelope> {
    // 兼容两种调用形式：
    // subscribeEvents(afterSeq)
    // subscribeEvents(scope, afterSeq)
    const scope = typeof scopeOrAfterSeq === "number" ? undefined : scopeOrAfterSeq;
    const seq = typeof scopeOrAfterSeq === "number" ? scopeOrAfterSeq : afterSeq;
    yield* (await this.getScopedSession(this.getScope(scope))).subscribeEvents(seq);
  }
}

/** 创建 harness session registry；当前实现始终返回单机内缓存的 DeviceHarnessSessionRegistry。 */
export async function createHarnessSessionRegistry(
  options: HarnessSessionRegistryOptions,
): Promise<HarnessSessionRegistry> {
  return new DeviceHarnessSessionRegistry(options);
}
