import type { SpawnWorkerInput, WorkerRole } from "./worker-types";
import type { WorkerStatus } from "../../domain/worker";

export type WorkerRuntimeState = {
  status: WorkerStatus;
  startedAt?: string;
  endedAt?: string;
  resumeToken?: string;
};

export type WorkerRuntime = {
  start(): Promise<WorkerRuntimeState | void>;
  inspect(): Promise<WorkerRuntimeState>;
  resume(): Promise<WorkerRuntimeState>;
  cancel(): Promise<WorkerRuntimeState>;
  join(): Promise<WorkerRuntimeState>;
};

export type WorkerRuntimeContext = {
  workerId: string;
  role: WorkerRole;
  taskId: SpawnWorkerInput["taskId"];
  threadId: SpawnWorkerInput["threadId"];
  spawnReason: SpawnWorkerInput["spawnReason"];
};

export type WorkerRuntimeFactory = (input: WorkerRuntimeContext) => WorkerRuntime;

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
