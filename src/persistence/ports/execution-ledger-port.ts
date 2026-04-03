import type { StoragePort } from "./storage-port";

export type ExecutionStatus = "planned" | "started" | "completed" | "failed" | "unknown_after_crash";

export type ExecutionLedgerEntry = {
  executionId: string;
  threadId: string;
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

export interface ExecutionLedgerPort extends StoragePort {
  save(entry: ExecutionLedgerEntry): Promise<void>;
  get(executionId: string): Promise<ExecutionLedgerEntry | undefined>;
  listByThread(threadId: string): Promise<ExecutionLedgerEntry[]>;
  findUncertain(threadId: string): Promise<ExecutionLedgerEntry[]>;
}
