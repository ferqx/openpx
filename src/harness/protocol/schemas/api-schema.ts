import { z } from "zod";
export { agentRunViewSchema } from "../views/agent-run-view";
export { answerViewSchema } from "../views/answer-view";
export { approvalViewSchema } from "../views/approval-view";
export { messageViewSchema } from "../views/message-view";
export { protocolVersionSchema } from "./protocol-version";
export { runViewSchema } from "../views/run-view";
export { runtimeCommandSchema } from "../commands/runtime-command-schema";
export { runtimeEventEnvelopeSchema, runtimeEventSchema } from "../events/runtime-event-schema";
export { runtimeSnapshotSchema } from "../views/runtime-snapshot-schema";
export { taskViewSchema } from "../views/task-view";
export { threadViewSchema } from "../views/thread-view";

import { agentRunViewSchema } from "../views/agent-run-view";
import { answerViewSchema } from "../views/answer-view";
import { approvalViewSchema } from "../views/approval-view";
import { messageViewSchema } from "../views/message-view";
import { protocolVersionSchema } from "./protocol-version";
import { runViewSchema } from "../views/run-view";
import { runtimeCommandSchema } from "../commands/runtime-command-schema";
import { runtimeEventEnvelopeSchema, runtimeEventSchema } from "../events/runtime-event-schema";
import { runtimeSnapshotSchema } from "../views/runtime-snapshot-schema";
import { taskViewSchema } from "../views/task-view";
import { threadViewSchema } from "../views/thread-view";

/**
 * Metadata for the OpenPX Harness Protocol.
 * 它定义 surface 与 harness app server 之间的稳定契约，
 * 可用于运行时校验、文档生成与协议兼容性检查。
 */
export const apiMetadata = {
  version: "1.0.0",
  title: "OpenPX Harness Protocol",
  description: "Stable protocol for interacting with the OpenPX harness, including snapshots, commands, and event streams.",
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
export const runtimeAgentRunSchema = agentRunViewSchema;

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
