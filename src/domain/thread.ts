export type ThreadStatus = "idle" | "active" | "waiting_approval" | "interrupted" | "completed" | "failed";

export type Thread = {
  threadId: string;
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
  return { threadId, status: "active" };
}

export function transitionThread(thread: Thread, status: ThreadStatus): Thread {
  if (!allowedThreadTransitions[thread.status].includes(status)) {
    throw new Error(`invalid thread transition from ${thread.status} to ${status}`);
  }

  return { ...thread, status };
}
