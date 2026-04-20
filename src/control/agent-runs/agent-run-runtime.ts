import type { AgentRunRuntimeRole, AgentRunStatus } from "../../domain/agent-run";
import type { SpawnAgentRunInput } from "./agent-run-types";

/** AgentRun runtime 回报给 manager 的最小状态快照。 */
export type AgentRunRuntimeState = {
  status: AgentRunStatus;
  startedAt?: string;
  endedAt?: string;
  resumeToken?: string;
};

/** AgentRun runtime 接口：覆盖 start/inspect/resume/cancel/join 五类生命周期动作。 */
export type AgentRunRuntime = {
  start(): Promise<AgentRunRuntimeState | void>;
  inspect(): Promise<AgentRunRuntimeState>;
  resume(): Promise<AgentRunRuntimeState>;
  cancel(): Promise<AgentRunRuntimeState>;
  join(): Promise<AgentRunRuntimeState>;
};

/** 创建 runtime 时需要的上下文。 */
export type AgentRunRuntimeContext = {
  agentRunId: string;
  role: AgentRunRuntimeRole;
  taskId: SpawnAgentRunInput["taskId"];
  threadId: SpawnAgentRunInput["threadId"];
  spawnReason: SpawnAgentRunInput["spawnReason"];
};

/** runtime 工厂接口。 */
export type AgentRunRuntimeFactory = (input: AgentRunRuntimeContext) => AgentRunRuntime;

/** 被动 AgentRun runtime：不真正执行外部任务，只模拟生命周期。 */
export function createPassiveAgentRunRuntimeFactory(): AgentRunRuntimeFactory {
  return () => {
    let state: AgentRunRuntimeState = {
      status: "created",
    };

    return {
      async start() {
        state = {
          status: "running",
          startedAt: state.startedAt ?? new Date().toISOString(),
          resumeToken: state.resumeToken,
        };
        return state;
      },
      async inspect() {
        return state;
      },
      async resume() {
        state = {
          ...state,
          status: "running",
          startedAt: state.startedAt ?? new Date().toISOString(),
        };
        return state;
      },
      async cancel() {
        state = {
          ...state,
          status: "cancelled",
          endedAt: new Date().toISOString(),
          resumeToken: undefined,
        };
        return state;
      },
      async join() {
        state = {
          ...state,
          status: "completed",
          endedAt: new Date().toISOString(),
          resumeToken: undefined,
        };
        return state;
      },
    };
  };
}
