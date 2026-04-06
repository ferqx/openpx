import type { WorkerRuntime, WorkerRuntimeFactory, WorkerRuntimeState } from "./worker-runtime";
import type { SpawnWorkerInput, WorkerRecord } from "./worker-types";
import { createWorkerRecord, transitionWorker } from "./worker-types";
import { prefixedUuid } from "../../shared/id-generators";
import type { WorkerStorePort } from "../../persistence/ports/worker-store-port";

export type WorkerManager = {
  spawn(input: SpawnWorkerInput): Promise<WorkerRecord>;
  inspect(workerId: string): Promise<WorkerRecord | undefined>;
  resume(workerId: string): Promise<WorkerRecord>;
  cancel(workerId: string): Promise<WorkerRecord>;
  join(workerId: string): Promise<WorkerRecord>;
};

export function createWorkerManager(deps: {
  runtimeFactory: WorkerRuntimeFactory;
  workerStore: WorkerStorePort;
}): WorkerManager {
  const runtimes = new Map<string, WorkerRuntime>();

  async function persist(worker: WorkerRecord): Promise<WorkerRecord> {
    await deps.workerStore.save(worker);
    return worker;
  }

  async function getWorkerOrThrow(workerId: string): Promise<WorkerRecord> {
    const worker = await deps.workerStore.get(workerId);
    if (!worker) {
      throw new Error(`worker ${workerId} not found`);
    }
    return worker;
  }

  function applyRuntimeState(worker: WorkerRecord, state: WorkerRuntimeState): WorkerRecord {
    if (worker.status === state.status) {
      return {
        ...worker,
        startedAt: state.startedAt ?? worker.startedAt,
        endedAt: state.endedAt ?? worker.endedAt,
        resumeToken: state.resumeToken !== undefined ? state.resumeToken : worker.resumeToken,
      };
    }

    return transitionWorker(worker, state.status, {
      startedAt: state.startedAt,
      endedAt: state.endedAt,
      resumeToken: state.resumeToken,
    });
  }

  return {
    async spawn(input) {
      const workerId = prefixedUuid("worker");
      let worker = await persist(
        createWorkerRecord({
          workerId,
          taskId: input.taskId,
          threadId: input.threadId,
          role: input.role,
          spawnReason: input.spawnReason,
          resumeToken: input.resumeToken,
        }),
      );

      const runtime = deps.runtimeFactory({
        workerId,
        role: input.role,
        taskId: input.taskId,
        threadId: input.threadId,
        spawnReason: input.spawnReason,
      });
      runtimes.set(workerId, runtime);

      worker = await persist(transitionWorker(worker, "starting"));
      const startState = await runtime.start();
      if (!startState) {
        return await persist(
          transitionWorker(worker, "running", {
            startedAt: new Date().toISOString(),
          }),
        );
      }

      return await persist(applyRuntimeState(worker, startState));
    },

    async inspect(workerId) {
      const runtime = runtimes.get(workerId);
      const worker = await deps.workerStore.get(workerId);
      if (!worker) {
        return undefined;
      }
      if (!runtime) {
        return worker;
      }

      return await persist(applyRuntimeState(worker, await runtime.inspect()));
    },

    async resume(workerId) {
      const runtime = runtimes.get(workerId);
      if (!runtime) {
        throw new Error(`worker runtime ${workerId} not found`);
      }
      const worker = await getWorkerOrThrow(workerId);
      return await persist(applyRuntimeState(worker, await runtime.resume()));
    },

    async cancel(workerId) {
      const runtime = runtimes.get(workerId);
      if (!runtime) {
        throw new Error(`worker runtime ${workerId} not found`);
      }
      const worker = await getWorkerOrThrow(workerId);
      const next = await persist(applyRuntimeState(worker, await runtime.cancel()));
      if (["completed", "failed", "cancelled"].includes(next.status)) {
        runtimes.delete(workerId);
      }
      return next;
    },

    async join(workerId) {
      const runtime = runtimes.get(workerId);
      if (!runtime) {
        throw new Error(`worker runtime ${workerId} not found`);
      }
      const worker = await getWorkerOrThrow(workerId);
      const next = await persist(applyRuntimeState(worker, await runtime.join()));
      if (["completed", "failed", "cancelled"].includes(next.status)) {
        runtimes.delete(workerId);
      }
      return next;
    },
  };
}
