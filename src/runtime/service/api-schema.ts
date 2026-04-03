import { z } from "zod";
import { threadStatusSchema, taskStatusSchema, approvalStatusSchema } from "../../shared/schemas";

/**
 * Metadata for the Stable Control API.
 * This can be used to generate OpenAPI documentation or for runtime validation.
 */
export const apiMetadata = {
  version: "1.0.0",
  title: "OpenWenpx Stable Control API",
  description: "HTTP API for controlling the OpenWenpx runtime and subscribing to events.",
};

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  version: z.string(),
  protocolVersion: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const runtimeThreadSummarySchema = z.object({
  threadId: z.string(),
  workspaceRoot: z.string(),
  projectId: z.string(),
  revision: z.number(),
  status: threadStatusSchema,
});

export const runtimeTaskSummarySchema = z.object({
  taskId: z.string(),
  status: taskStatusSchema,
  summary: z.string(),
  blockingReason: z
    .object({
      kind: z.enum(["waiting_approval", "human_recovery"]),
      message: z.string(),
    })
    .optional(),
});

export const runtimePendingApprovalSchema = z.object({
  approvalRequestId: z.string(),
  summary: z.string(),
  risk: z.string(),
  status: approvalStatusSchema,
});

export const runtimeAnswerSchema = z.object({
  answerId: z.string(),
  content: z.string(),
});

export const runtimeSnapshotSchema = z.object({
  protocolVersion: z.string(),
  workspaceRoot: z.string(),
  projectId: z.string(),
  lastEventSeq: z.number(),
  activeThreadId: z.string().optional(),
  recommendationReason: z.string().optional(),
  blockingReason: z
    .object({
      kind: z.enum(["waiting_approval", "human_recovery"]),
      message: z.string(),
    })
    .optional(),
  threads: z.array(runtimeThreadSummarySchema),
  tasks: z.array(runtimeTaskSummarySchema),
  pendingApprovals: z.array(runtimePendingApprovalSchema),
  answers: z.array(runtimeAnswerSchema),
});

export type RuntimeSnapshot = z.infer<typeof runtimeSnapshotSchema>;

export const runtimeCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("new_thread") }),
  z.object({ kind: z.literal("switch_thread"), threadId: z.string() }),
  z.object({ kind: z.literal("continue"), threadId: z.string() }),
  z.object({ kind: z.literal("add_task"), content: z.string(), background: z.boolean().optional() }),
  z.object({ kind: z.literal("approve"), approvalRequestId: z.string() }),
  z.object({ kind: z.literal("reject"), approvalRequestId: z.string(), reason: z.string().optional() }),
]);

export type RuntimeCommand = z.infer<typeof runtimeCommandSchema>;

export const runtimeEventEnvelopeSchema = z.object({
  protocolVersion: z.string(),
  seq: z.number(),
  timestamp: z.string(),
  traceId: z.string().optional(),
  clientId: z.string().optional(),
  event: z.any(), // Keeping this broad for now, but in a real API we'd want more structure
});

export type RuntimeEventEnvelope = z.infer<typeof runtimeEventEnvelopeSchema>;

/**
 * Exporting all schemas for easy reference in documentation tools or tests.
 */
export const schemas = {
  HealthResponse: healthResponseSchema,
  RuntimeSnapshot: runtimeSnapshotSchema,
  RuntimeCommand: runtimeCommandSchema,
  RuntimeEventEnvelope: runtimeEventEnvelopeSchema,
};
