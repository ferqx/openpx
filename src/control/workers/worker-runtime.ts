import type { SpawnWorkerInput, WorkerRole } from "./worker-types";
import type { WorkerStatus } from "../../domain/worker";

/** worker runtime 回报给 manager 的最小状态快照 */
export type WorkerRuntimeState = {
  status: WorkerStatus;
  startedAt?: string;
  endedAt?: string;
  resumeToken?: string;
};

/** worker runtime 接口：覆盖 start/inspect/resume/cancel/join 五类生命周期动作 */
export type WorkerRuntime = {
  start(): Promise<WorkerRuntimeState | void>;
  inspect(): Promise<WorkerRuntimeState>;
  resume(): Promise<WorkerRuntimeState>;
  cancel(): Promise<WorkerRuntimeState>;
  join(): Promise<WorkerRuntimeState>;
};

/** 创建 runtime 时需要的上下文 */
export type WorkerRuntimeContext = {
  workerId: string;
  role: WorkerRole;
  taskId: SpawnWorkerInput["taskId"];
  threadId: SpawnWorkerInput["threadId"];
  spawnReason: SpawnWorkerInput["spawnReason"];
};

/** runtime 工厂接口 */
export type WorkerRuntimeFactory = (input: WorkerRuntimeContext) => WorkerRuntime;

/** 被动 worker runtime：不真正执行外部任务，只模拟生命周期 */
export function createPassiveWorkerRuntimeFactory(): WorkerRuntimeFactory {
  return () => {
    let state: WorkerRuntimeState = {
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
