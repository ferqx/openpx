import { transitionThread, type Thread } from "../domain/thread";

export async function resolveSubmitTargetThread(input: {
  latestThread: Thread | undefined;
  expectedRevision: number | undefined;
  startThread: () => Promise<Thread>;
  saveThread: (thread: Thread) => Promise<void>;
  ensureRevision: (threadId: string, expectedRevision: number | undefined) => Promise<void>;
}): Promise<{ thread: Thread; startedNewThread: boolean }> {
  const { latestThread } = input;

  if (!latestThread || latestThread.status === "failed") {
    return {
      thread: await input.startThread(),
      startedNewThread: true,
    };
  }

  if (latestThread.status === "blocked") {
    await input.ensureRevision(latestThread.threadId, input.expectedRevision);
    return {
      thread: latestThread,
      startedNewThread: false,
    };
  }

  if (latestThread.status !== "active") {
    const activeThread = transitionThread(latestThread, "active");
    await input.saveThread(activeThread);
    return {
      thread: activeThread,
      startedNewThread: false,
    };
  }

  return {
    thread: latestThread,
    startedNewThread: false,
  };
}
