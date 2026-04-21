import type { AgentRunRuntime, AgentRunRuntimeFactory, AgentRunRuntimeState } from "./agent-run-runtime";
import type { AgentRunRecord, SpawnAgentRunInput } from "./agent-run-types";
import { createStoredAgentRunRecord, transitionAgentRun } from "./agent-run-types";
import { prefixedUuid } from "../../shared/id-generators";
import type { AgentRunStorePort } from "../../persistence/ports/agent-run-store-port";

/** AgentRun manager 对外能力：spawn / inspect / resume / cancel / join。 */
export type AgentRunManager = {
  spawn(input: SpawnAgentRunInput): Promise<AgentRunRecord>;
  inspect(agentRunId: string): Promise<AgentRunRecord | undefined>;
  resume(agentRunId: string): Promise<AgentRunRecord>;
  cancel(agentRunId: string): Promise<AgentRunRecord>;
  join(agentRunId: string): Promise<AgentRunRecord>;
};

/** 创建 AgentRun manager：负责 runtime 生命周期与持久化记录对齐。 */
export function createAgentRunManager(deps: {
  runtimeFactory: AgentRunRuntimeFactory;
  agentRunStore: AgentRunStorePort;
}): AgentRunManager {
  const runtimes = new Map<string, AgentRunRuntime>();

  /** 持久化 AgentRun 并返回同一对象，便于链式调用。 */
  async function persist(agentRun: AgentRunRecord): Promise<AgentRunRecord> {
    await deps.agentRunStore.save(agentRun);
    return agentRun;
  }

  async function getAgentRunOrThrow(agentRunId: string): Promise<AgentRunRecord> {
    const agentRun = await deps.agentRunStore.get(agentRunId);
    if (!agentRun) {
      throw new Error(`agent run ${agentRunId} not found`);
    }
    return agentRun;
  }

  /** 把 runtime 状态投影回领域 AgentRunRecord。 */
  function applyRuntimeState(agentRun: AgentRunRecord, state: AgentRunRuntimeState): AgentRunRecord {
    if (agentRun.status === state.status) {
      return {
        ...agentRun,
        startedAt: state.startedAt ?? agentRun.startedAt,
        endedAt: state.endedAt ?? agentRun.endedAt,
        resumeToken: state.resumeToken !== undefined ? state.resumeToken : agentRun.resumeToken,
      };
    }

    return transitionAgentRun(agentRun, state.status, {
      startedAt: state.startedAt,
      endedAt: state.endedAt,
      resumeToken: state.resumeToken,
    });
  }

  /** runtime 不在内存中时的兜底生命周期推进，用于重启后恢复或测试场景 */
  async function fallbackLifecycleUpdate(
    agentRun: AgentRunRecord,
    action: "inspect" | "resume" | "cancel" | "join",
  ): Promise<AgentRunRecord> {
    if (action === "inspect") {
      return agentRun;
    }

    if (action === "resume") {
      const resumedStatus = agentRun.status === "created" || agentRun.status === "starting"
        ? "running"
        : agentRun.status;
      if (agentRun.status === "paused" || resumedStatus === "running") {
        return await persist(
          transitionAgentRun(agentRun, "running", {
            startedAt: agentRun.startedAt ?? new Date().toISOString(),
          }),
        );
      }
      return agentRun;
    }

    if (action === "cancel" && !["completed", "failed", "cancelled"].includes(agentRun.status)) {
      return await persist(
        transitionAgentRun(agentRun, "cancelled", {
          endedAt: new Date().toISOString(),
          resumeToken: undefined,
        }),
      );
    }

    if (action === "join" && !["completed", "failed", "cancelled"].includes(agentRun.status)) {
      return await persist(
        transitionAgentRun(agentRun, "completed", {
          endedAt: new Date().toISOString(),
          resumeToken: undefined,
        }),
      );
    }

    return agentRun;
  }

  return {
    async spawn(input) {
      const agentRunId = prefixedUuid("agent_run");
      let agentRun = await persist(
        createStoredAgentRunRecord({
          agentRunId,
          taskId: input.taskId,
          threadId: input.threadId,
          role: input.role,
          spawnReason: input.spawnReason,
          resumeToken: input.resumeToken,
        }),
      );

      const runtime = deps.runtimeFactory({
        agentRunId,
        role: input.role,
        taskId: input.taskId,
        threadId: input.threadId,
        spawnReason: input.spawnReason,
      });
      runtimes.set(agentRunId, runtime);

      // 先把 AgentRun 置为 starting，再由 runtime.start 回报更具体状态。
      agentRun = await persist(transitionAgentRun(agentRun, "starting"));
      const startState = await runtime.start();
      if (!startState) {
        // 某些 runtime 不显式回传 startState，这里兜底为 running。
        return await persist(
          transitionAgentRun(agentRun, "running", {
            startedAt: new Date().toISOString(),
          }),
        );
      }

      return await persist(applyRuntimeState(agentRun, startState));
    },

    async inspect(agentRunId) {
      const runtime = runtimes.get(agentRunId);
      const agentRun = await deps.agentRunStore.get(agentRunId);
      if (!agentRun) {
        return undefined;
      }
      if (!runtime) {
        return await fallbackLifecycleUpdate(agentRun, "inspect");
      }

      return await persist(applyRuntimeState(agentRun, await runtime.inspect()));
    },

    async resume(agentRunId) {
      const runtime = runtimes.get(agentRunId);
      const agentRun = await getAgentRunOrThrow(agentRunId);
      if (!runtime) {
        return await fallbackLifecycleUpdate(agentRun, "resume");
      }
      return await persist(applyRuntimeState(agentRun, await runtime.resume()));
    },

    async cancel(agentRunId) {
      const runtime = runtimes.get(agentRunId);
      const agentRun = await getAgentRunOrThrow(agentRunId);
      if (!runtime) {
        return await fallbackLifecycleUpdate(agentRun, "cancel");
      }
      const next = await persist(applyRuntimeState(agentRun, await runtime.cancel()));
      if (["completed", "failed", "cancelled"].includes(next.status)) {
        // 终态 AgentRun 不再需要保留活动 runtime 句柄。
        runtimes.delete(agentRunId);
      }
      return next;
    },

    async join(agentRunId) {
      const runtime = runtimes.get(agentRunId);
      const agentRun = await getAgentRunOrThrow(agentRunId);
      if (!runtime) {
        return await fallbackLifecycleUpdate(agentRun, "join");
      }
      const next = await persist(applyRuntimeState(agentRun, await runtime.join()));
      if (["completed", "failed", "cancelled"].includes(next.status)) {
        runtimes.delete(agentRunId);
      }
      return next;
    },
  };
}
