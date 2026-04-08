import { z } from "zod";
export { answerViewSchema } from "./protocol/answer-view";
export { approvalViewSchema } from "./protocol/approval-view";
export { messageViewSchema } from "./protocol/message-view";
export { protocolVersionSchema } from "./protocol/protocol-version";
export { runViewSchema } from "./protocol/run-view";
export { runtimeCommandSchema } from "./protocol/runtime-command-schema";
export { runtimeEventEnvelopeSchema, runtimeEventSchema } from "./protocol/runtime-event-schema";
export { runtimeSnapshotSchema } from "./protocol/runtime-snapshot-schema";
export { taskViewSchema } from "./protocol/task-view";
export { threadViewSchema } from "./protocol/thread-view";
export { workerViewSchema } from "./protocol/worker-view";

import { answerViewSchema } from "./protocol/answer-view";
import { approvalViewSchema } from "./protocol/approval-view";
import { messageViewSchema } from "./protocol/message-view";
import { protocolVersionSchema } from "./protocol/protocol-version";
import { runViewSchema } from "./protocol/run-view";
import { runtimeCommandSchema } from "./protocol/runtime-command-schema";
import { runtimeEventEnvelopeSchema, runtimeEventSchema } from "./protocol/runtime-event-schema";
import { runtimeSnapshotSchema } from "./protocol/runtime-snapshot-schema";
import { taskViewSchema } from "./protocol/task-view";
import { threadViewSchema } from "./protocol/thread-view";
import { workerViewSchema } from "./protocol/worker-view";

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
  protocolVersion: protocolVersionSchema,
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const runtimeThreadSummarySchema = threadViewSchema;

export const runtimeTaskSummarySchema = taskViewSchema;
export const runtimeRunSchema = runViewSchema;

export const runtimePendingApprovalSchema = approvalViewSchema;

export const runtimeAnswerSchema = answerViewSchema;
export const runtimeMessageSchema = messageViewSchema;
export const runtimeWorkerSchema = workerViewSchema;

export type RuntimeSnapshot = z.infer<typeof runtimeSnapshotSchema>;
export type RuntimeCommand = z.infer<typeof runtimeCommandSchema>;
export type RuntimeEvent = z.infer<typeof runtimeEventSchema>;
export type RuntimeEventEnvelope = z.infer<typeof runtimeEventEnvelopeSchema>;

/**
 * Exporting all schemas for easy reference in documentation tools or tests.
 */
export const schemas = {
  HealthResponse: healthResponseSchema,
  RuntimeSnapshot: runtimeSnapshotSchema,
  RuntimeCommand: runtimeCommandSchema,
  RuntimeEvent: runtimeEventSchema,
  RuntimeEventEnvelope: runtimeEventEnvelopeSchema,
};
