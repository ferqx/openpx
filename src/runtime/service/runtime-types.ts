import { z } from "zod";
import { threadStatusSchema, taskStatusSchema, approvalStatusSchema } from "../../shared/schemas";

export const PROTOCOL_VERSION = "1.0.0";

export const runtimeSnapshotSchema = z.object({
  protocolVersion: z.string(),
  workspaceRoot: z.string(),
  projectId: z.string(),
  lastEventSeq: z.number(),
  activeThreadId: z.string(),
  threads: z.array(z.object({
    threadId: z.string(),
    workspaceRoot: z.string(),
    projectId: z.string(),
    revision: z.number(),
    status: threadStatusSchema,
  })),
  tasks: z.array(z.object({
    taskId: z.string(),
    status: taskStatusSchema,
    summary: z.string(),
  })),
  pendingApprovals: z.array(z.object({
    approvalRequestId: z.string(),
    summary: z.string(),
    risk: z.string(),
    status: approvalStatusSchema,
  })),
  answers: z.array(z.object({
    answerId: z.string(),
    content: z.string(),
  })),
});

export type RuntimeSnapshot = z.infer<typeof runtimeSnapshotSchema>;

export const runtimeCommandSchema = z.union([
  z.object({ kind: z.literal("new_thread") }),
  z.object({ kind: z.literal("switch_thread"), threadId: z.string() }),
  z.object({ kind: z.literal("continue"), threadId: z.string() }),
  z.object({ kind: z.literal("add_task"), content: z.string() }),
  z.object({ kind: z.literal("approve"), approvalRequestId: z.string() }),
  z.object({ kind: z.literal("reject"), approvalRequestId: z.string(), reason: z.string().optional() }),
]);

export type RuntimeCommand = z.infer<typeof runtimeCommandSchema>;

export const runtimeEventEnvelopeSchema = z.object({
  protocolVersion: z.string(),
  seq: z.number(),
  event: z.any(),
});

export type RuntimeEventEnvelope = z.infer<typeof runtimeEventEnvelopeSchema>;
