import { domainError } from "../shared/errors";
import { runId as sharedRunId, threadId as sharedThreadId } from "../shared/ids";
import { runStatusSchema, runTriggerSchema } from "../shared/schemas";
import { z } from "zod";

export type RunStatus = z.infer<typeof runStatusSchema>;
export type RunTrigger = z.infer<typeof runTriggerSchema>;

export type RunBlockingReason = {
  kind: "waiting_approval" | "human_recovery" | "environment_block";
  message: string;
};

export type RunLedgerState = {
  lastCompletedToolCallId?: string;
  pendingToolCallId?: string;
};

export type Run = {
  runId: ReturnType<typeof sharedRunId>;
  threadId: ReturnType<typeof sharedThreadId>;
  status: RunStatus;
  trigger: RunTrigger;
  inputText?: string;
  activeTaskId?: string;
  startedAt: string;
  endedAt?: string;
  resultSummary?: string;
  resumeToken?: string;
  blockingReason?: RunBlockingReason;
  ledgerState?: RunLedgerState;
};

const allowedRunTransitions: Record<RunStatus, readonly RunStatus[]> = {
  created: ["running", "interrupted", "completed", "failed"],
  running: ["waiting_approval", "blocked", "completed", "failed", "interrupted"],
  waiting_approval: ["running", "blocked", "completed", "failed", "interrupted"],
  blocked: ["running", "completed", "failed", "interrupted"],
  completed: [],
  failed: [],
  interrupted: ["running", "completed", "failed"],
};

export function createRun(input: {
  runId: string;
  threadId: string;
  trigger: RunTrigger;
  inputText?: string;
  activeTaskId?: string;
  startedAt?: string;
  endedAt?: string;
  resultSummary?: string;
  resumeToken?: string;
  blockingReason?: RunBlockingReason;
  ledgerState?: RunLedgerState;
}): Run {
  return {
    runId: sharedRunId(input.runId),
    threadId: sharedThreadId(input.threadId),
    status: "created",
    trigger: runTriggerSchema.parse(input.trigger),
    inputText: input.inputText,
    activeTaskId: input.activeTaskId,
    startedAt: input.startedAt ?? new Date().toISOString(),
    endedAt: input.endedAt,
    resultSummary: input.resultSummary,
    resumeToken: input.resumeToken,
    blockingReason: input.blockingReason,
    ledgerState: input.ledgerState,
  };
}

export function transitionRun(run: Run, status: RunStatus): Run {
  const allowedStatuses = allowedRunTransitions[run.status] ?? [];

  if (!allowedStatuses.includes(status)) {
    throw domainError(`invalid run transition from ${run.status} to ${status}`);
  }

  return { ...run, status };
}
