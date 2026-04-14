import type { StoragePort } from "./storage-port";

/** 工具执行账本状态：planned/started/completed/failed/unknown_after_crash */
export type ExecutionStatus = "planned" | "started" | "completed" | "failed" | "unknown_after_crash";

/** 执行账本条目：记录 effectful tool 的完整执行轨迹 */
export type ExecutionLedgerEntry = {
  executionId: string;
  threadId: string;
  runId?: string;
  taskId: string;
  toolCallId: string;
  toolName: string;
  argsJson: string;
  status: ExecutionStatus;
  resultJson?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

/** 执行账本端口：供审批、执行和 crash recovery 共用 */
export interface ExecutionLedgerPort extends StoragePort {
  save(entry: ExecutionLedgerEntry): Promise<void>;
  get(executionId: string): Promise<ExecutionLedgerEntry | undefined>;
  listByThread(threadId: string): Promise<ExecutionLedgerEntry[]>;
  findUncertain(threadId: string): Promise<ExecutionLedgerEntry[]>;
}
