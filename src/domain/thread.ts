import { threadId as sharedThreadId } from "../shared/ids";
import { domainError } from "../shared/errors";
import { threadStatusSchema } from "../shared/schemas";
import type { DerivedThreadView } from "../control/context/thread-compaction-types";
import { z } from "zod";

export type ThreadStatus = z.infer<typeof threadStatusSchema>;

// Thread 表示一条长期协作线。它负责承载 workspace/project 归属、
// durable narrative，以及跨多个 run 持续存在的上下文。
export type Thread = {
  threadId: ReturnType<typeof sharedThreadId>;
  workspaceRoot: string;
  projectId: string;
  revision: number;
  status: ThreadStatus;
  recommendationReason?: string;
  narrativeSummary?: string;
  narrativeRevision?: number;
} & DerivedThreadView;

const allowedThreadTransitions: Record<ThreadStatus, readonly ThreadStatus[]> = {
  active: ["idle", "archived"],
  idle: ["active", "archived"],
  archived: ["active"],
};

export function createThread(threadId: string, workspaceRoot: string = "", projectId: string = ""): Thread {
  return {
    threadId: sharedThreadId(threadId),
    workspaceRoot,
    projectId,
    revision: 1,
    status: "active",
  };
}

export function transitionThread(thread: Thread, status: ThreadStatus): Thread {
  const allowedStatuses = allowedThreadTransitions[thread.status] ?? [];

  if (!allowedStatuses.includes(status)) {
    throw domainError(`invalid thread transition from ${thread.status} to ${status}`);
  }

  return { ...thread, status };
}
