export type ThreadStatus = "idle" | "active" | "waiting_approval" | "interrupted" | "completed" | "failed";

export type Thread = {
  threadId: string;
  status: ThreadStatus;
};

export function createThread(threadId: string): Thread {
  return { threadId, status: "active" };
}

export function transitionThread(thread: Thread, status: ThreadStatus): Thread {
  return { ...thread, status };
}
