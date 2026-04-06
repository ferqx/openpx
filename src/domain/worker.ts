import { z } from "zod";
import { domainError } from "../shared/errors";
import { taskId as sharedTaskId, threadId as sharedThreadId, workerId as sharedWorkerId } from "../shared/ids";
import { workerStatusSchema } from "../shared/schemas";

export type WorkerStatus = z.infer<typeof workerStatusSchema>;
export type WorkerRole = "planner" | "executor" | "verifier" | "memory_maintainer";

export type Worker = {
  workerId: ReturnType<typeof sharedWorkerId>;
  threadId: ReturnType<typeof sharedThreadId>;
  taskId: ReturnType<typeof sharedTaskId>;
  role: WorkerRole;
  spawnReason: string;
  status: WorkerStatus;
  startedAt?: string;
  endedAt?: string;
  resumeToken?: string;
};

const allowedWorkerTransitions: Record<WorkerStatus, readonly WorkerStatus[]> = {
  created: ["starting", "cancelled"],
  starting: ["running", "failed", "cancelled"],
  running: ["paused", "completed", "failed", "cancelled"],
  paused: ["running", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

export function createWorker(input: {
  workerId: string;
  threadId: string;
  taskId: string;
  role: WorkerRole;
  spawnReason: string;
  resumeToken?: string;
}): Worker {
  return {
    workerId: sharedWorkerId(input.workerId),
    threadId: sharedThreadId(input.threadId),
    taskId: sharedTaskId(input.taskId),
    role: input.role,
    spawnReason: input.spawnReason,
    status: "created",
    resumeToken: input.resumeToken,
  };
}

export function transitionWorker(
  worker: Worker,
  status: WorkerStatus,
  metadata: {
    startedAt?: string;
    endedAt?: string;
    resumeToken?: string | undefined;
  } = {},
): Worker {
  if (worker.status !== status) {
    const allowedStatuses = allowedWorkerTransitions[worker.status] ?? [];
    if (!allowedStatuses.includes(status)) {
      throw domainError(`invalid worker transition from ${worker.status} to ${status}`);
    }
  }

  const hasResumeTokenOverride = Object.prototype.hasOwnProperty.call(metadata, "resumeToken");

  return {
    ...worker,
    status,
    startedAt: metadata.startedAt ?? worker.startedAt,
    endedAt: metadata.endedAt ?? worker.endedAt,
    resumeToken: hasResumeTokenOverride ? metadata.resumeToken : worker.resumeToken,
  };
}
