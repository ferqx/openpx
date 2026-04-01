import type { WorkerRuntimeFactory } from "./worker-runtime";
import type { SpawnWorkerInput, WorkerRecord } from "./worker-types";
import { createWorkerRecord } from "./worker-types";

export type WorkerManager = {
  spawn(input: SpawnWorkerInput): Promise<WorkerRecord>;
};

export function createWorkerManager(deps: {
  runtimeFactory: WorkerRuntimeFactory;
}): WorkerManager {
  return {
    async spawn(input) {
      const runtime = deps.runtimeFactory({ role: input.role });
      await runtime.start();

      return createWorkerRecord({
        workerId: `worker_${Date.now()}`,
        taskId: input.taskId,
        threadId: input.threadId,
        role: input.role,
        spawnReason: input.spawnReason,
        status: "running",
      });
    },
  };
}
