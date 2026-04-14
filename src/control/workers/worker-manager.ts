import type { WorkerRuntime, WorkerRuntimeFactory, WorkerRuntimeState } from "./worker-runtime";
import type { SpawnWorkerInput, WorkerRecord } from "./worker-types";
import { createWorkerRecord, transitionWorker } from "./worker-types";
import { prefixedUuid } from "../../shared/id-generators";
import type { WorkerStorePort } from "../../persistence/ports/worker-store-port";

/** worker manager 对外能力：spawn / inspect / resume / cancel / join */
export type WorkerManager = {
  spawn(input: SpawnWorkerInput): Promise<WorkerRecord>;
  inspect(workerId: string): Promise<WorkerRecord | undefined>;
  resume(workerId: string): Promise<WorkerRecord>;
  cancel(workerId: string): Promise<WorkerRecord>;
  join(workerId: string): Promise<WorkerRecord>;
};

/** 创建 worker manager：负责 runtime 生命周期与持久化记录对齐 */
export function createWorkerManager(deps: {
  runtimeFactory: WorkerRuntimeFactory;
  workerStore: WorkerStorePort;
}): WorkerManager {
  const runtimes = new Map<string, WorkerRuntime>();

  /** 持久化 worker 并返回同一对象，便于链式调用 */
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

  /** 把 runtime 状态投影回领域 WorkerRecord */
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

  /** runtime 不在内存中时的兜底生命周期推进，用于重启后恢复或测试场景 */
  async function fallbackLifecycleUpdate(
    worker: WorkerRecord,
    action: "inspect" | "resume" | "cancel" | "join",
  ): Promise<WorkerRecord> {
    if (action === "inspect") {
      return worker;
    }

    if (action === "resume") {
      const resumedStatus = worker.status === "created" || worker.status === "starting" ? "running" : worker.status;
      if (worker.status === "paused" || resumedStatus === "running") {
        return await persist(
          transitionWorker(worker, "running", {
            startedAt: worker.startedAt ?? new Date().toISOString(),
          }),
        );
      }
      return worker;
    }

    if (action === "cancel" && !["completed", "failed", "cancelled"].includes(worker.status)) {
      return await persist(
        transitionWorker(worker, "cancelled", {
          endedAt: new Date().toISOString(),
          resumeToken: undefined,
        }),
      );
    }

    if (action === "join" && !["completed", "failed", "cancelled"].includes(worker.status)) {
      return await persist(
        transitionWorker(worker, "completed", {
          endedAt: new Date().toISOString(),
          resumeToken: undefined,
        }),
      );
    }

    return worker;
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

      // 先把 worker 置为 starting，再由 runtime.start 回报更具体状态。
      worker = await persist(transitionWorker(worker, "starting"));
      const startState = await runtime.start();
      if (!startState) {
        // 某些 runtime 不显式回传 startState，这里兜底为 running。
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
        return await fallbackLifecycleUpdate(worker, "inspect");
      }

      return await persist(applyRuntimeState(worker, await runtime.inspect()));
    },

    async resume(workerId) {
      const runtime = runtimes.get(workerId);
      const worker = await getWorkerOrThrow(workerId);
      if (!runtime) {
        return await fallbackLifecycleUpdate(worker, "resume");
      }
      return await persist(applyRuntimeState(worker, await runtime.resume()));
    },

    async cancel(workerId) {
      const runtime = runtimes.get(workerId);
      const worker = await getWorkerOrThrow(workerId);
      if (!runtime) {
        return await fallbackLifecycleUpdate(worker, "cancel");
      }
      const next = await persist(applyRuntimeState(worker, await runtime.cancel()));
      if (["completed", "failed", "cancelled"].includes(next.status)) {
        // 终态 worker 不再需要保留活动 runtime 句柄。
        runtimes.delete(workerId);
      }
      return next;
    },

    async join(workerId) {
      const runtime = runtimes.get(workerId);
      const worker = await getWorkerOrThrow(workerId);
      if (!runtime) {
        return await fallbackLifecycleUpdate(worker, "join");
      }
      const next = await persist(applyRuntimeState(worker, await runtime.join()));
      if (["completed", "failed", "cancelled"].includes(next.status)) {
        runtimes.delete(workerId);
      }
      return next;
    },
  };
}
