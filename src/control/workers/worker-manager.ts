import type { WorkerRuntimeFactory } from "./worker-runtime";
import type { SpawnWorkerInput, WorkerRecord } from "./worker-types";
import { createWorkerRecord } from "./worker-types";
import { prefixedUuid } from "../../shared/id-generators";

export type WorkerManager = {
  spawn(input: SpawnWorkerInput): Promise<WorkerRecord>;
};

export function createWorkerManager(deps: {
  runtimeFactory: WorkerRuntimeFactory;
}): WorkerManager {
  return {
    async spawn(input) {
      const workerId = prefixedUuid("worker");
      const runtime = deps.runtimeFactory({
        workerId,
        role: input.role,
        taskId: input.taskId,
        threadId: input.threadId,
        spawnReason: input.spawnReason,
      });
      await runtime.start();

      return createWorkerRecord({
        workerId,
        taskId: input.taskId,
        threadId: input.threadId,
        role: input.role,
        spawnReason: input.spawnReason,
        status: "running",
      });
    },
  };
}
