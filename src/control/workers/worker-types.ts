import {
  createWorker,
  transitionWorker,
  type Worker as WorkerRecord,
  type WorkerRole,
  type WorkerStatus,
} from "../../domain/worker";

export { createWorker, transitionWorker, type WorkerRecord, type WorkerRole, type WorkerStatus };

/** 创建 worker 时的最小输入 */
export type SpawnWorkerInput = {
  role: WorkerRole;
  taskId: string;
  threadId: string;
  spawnReason: string;
  resumeToken?: string;
};

/** 从领域 Worker 派生可持久化记录，允许在恢复或测试场景回填状态字段 */
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
    // created 态直接返回基础记录，不走状态迁移。
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
