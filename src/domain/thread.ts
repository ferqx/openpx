import { threadId as sharedThreadId } from "../shared/ids";
import { domainError } from "../shared/errors";
import { threadStatusSchema } from "../shared/schemas";
import { z } from "zod";

export type ThreadStatus = z.infer<typeof threadStatusSchema>;

export type Thread = {
  threadId: ReturnType<typeof sharedThreadId>;
  status: ThreadStatus;
};

const allowedThreadTransitions: Record<ThreadStatus, readonly ThreadStatus[]> = {
  idle: ["active"],
  active: ["waiting_approval", "interrupted", "completed", "failed"],
  waiting_approval: ["active", "interrupted", "completed", "failed"],
  interrupted: ["active", "completed", "failed"],
  completed: ["active"],
  failed: ["active"],
};

export function createThread(threadId: string): Thread {
  return { threadId: sharedThreadId(threadId), status: "active" };
}

export function transitionThread(thread: Thread, status: ThreadStatus): Thread {
  const allowedStatuses = allowedThreadTransitions[thread.status] ?? [];

  if (!allowedStatuses.includes(status)) {
    throw domainError(`invalid thread transition from ${thread.status} to ${status}`);
  }

  return { ...thread, status };
}
