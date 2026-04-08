import { z } from "zod";
import { answerViewSchema } from "./answer-view";
import { approvalViewSchema } from "./approval-view";
import { messageViewSchema } from "./message-view";
import { protocolVersionSchema } from "./protocol-version";
import { runViewSchema } from "./run-view";
import { taskBlockingReasonSchema, taskViewSchema } from "./task-view";
import { threadViewSchema } from "./thread-view";
import { workerViewSchema } from "./worker-view";

export const runtimeSnapshotSchema = z.object({
  protocolVersion: protocolVersionSchema,
  workspaceRoot: z.string(),
  projectId: z.string(),
  lastEventSeq: z.number().int().nonnegative(),
  activeThreadId: z.string().optional(),
  activeRunId: z.string().optional(),
  recommendationReason: z.string().optional(),
  narrativeSummary: z.string().optional(),
  blockingReason: taskBlockingReasonSchema.optional(),
  threads: z.array(threadViewSchema),
  runs: z.array(runViewSchema),
  tasks: z.array(taskViewSchema),
  pendingApprovals: z.array(approvalViewSchema),
  answers: z.array(answerViewSchema),
  messages: z.array(messageViewSchema).optional(),
  workers: z.array(workerViewSchema),
});

export type RuntimeSnapshot = z.infer<typeof runtimeSnapshotSchema>;
