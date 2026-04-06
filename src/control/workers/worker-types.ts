import {
  createWorker,
  transitionWorker,
  type Worker as WorkerRecord,
  type WorkerRole,
  type WorkerStatus,
} from "../../domain/worker";

export { createWorker, transitionWorker, type WorkerRecord, type WorkerRole, type WorkerStatus };

export type SpawnWorkerInput = {
  role: WorkerRole;
  taskId: string;
  threadId: string;
  spawnReason: string;
  resumeToken?: string;
};

export function createWorkerRecord(input: {
  workerId: string;
  taskId: string;
  threadId: string;
  role: WorkerRole;
  spawnReason: string;
  status?: WorkerStatus;
  startedAt?: string;
  endedAt?: string;
  resumeToken?: string;
}): WorkerRecord {
  const created = createWorker({
    workerId: input.workerId,
    taskId: input.taskId,
    threadId: input.threadId,
    role: input.role,
    spawnReason: input.spawnReason,
    resumeToken: input.resumeToken,
  });

  if (!input.status || input.status === "created") {
    return {
      ...created,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
    };
  }

  return transitionWorker(created, input.status, {
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    resumeToken: input.resumeToken,
  });
}
