import { z } from "zod";
import { threadStatusSchema, taskStatusSchema } from "../../../shared/schemas";
import { approvalViewSchema } from "./approval-view";
import { protocolVersionSchema } from "./protocol-version";
import { taskBlockingReasonSchema, taskViewSchema } from "./task-view";

export const runtimeEventTypes = [
  "thread.started",
  "thread.interrupted",
  "thread.blocked",
  "thread.view_updated",
  "task.created",
  "task.updated",
  "task.started",
  "task.completed",
  "task.failed",
  "tool.executed",
  "tool.failed",
  "model.status",
  "model.invocation_started",
  "model.first_token_received",
  "model.completed",
  "model.failed",
  "stream.thinking_started",
  "stream.thinking_chunk",
  "stream.tool_call_started",
  "stream.tool_call_completed",
  "stream.text_chunk",
  "stream.done",
] as const;

export function isRuntimeEventType(value: string): value is (typeof runtimeEventTypes)[number] {
  return (runtimeEventTypes as readonly string[]).includes(value);
}

const runtimeEventTypeSchema = z.enum(runtimeEventTypes);

const sessionThreadSummarySchema = z.object({
  threadId: z.string().min(1),
  status: z.string().min(1),
  narrativeSummary: z.string().optional(),
  pendingApprovalCount: z.number().int().nonnegative().optional(),
  blockingReasonKind: z.enum(["waiting_approval", "human_recovery"]).optional(),
});

const recoveryFactsSchema = z.object({
  threadId: z.string().min(1),
  revision: z.number().int().nonnegative(),
  schemaVersion: z.number().int().nonnegative(),
  status: z.string().min(1),
  updatedAt: z.string(),
  environment: z.object({
    gitHead: z.string().optional(),
    isDirty: z.boolean(),
    relativeCwd: z.string(),
    fingerprints: z.record(z.string(), z.string()),
  }).optional(),
  ledgerState: z.object({
    lastCompletedToolCallId: z.string().optional(),
    pendingToolCallId: z.string().optional(),
  }).optional(),
  activeTask: z.object({
    taskId: z.string().min(1),
    status: z.string().min(1),
    summary: z.string(),
  }).optional(),
  lastStableTask: z.object({
    taskId: z.string().min(1),
    status: z.string().min(1),
    summary: z.string(),
  }).optional(),
  blocking: z.object({
    sourceTaskId: z.string().min(1),
    kind: z.enum(["waiting_approval", "human_recovery"]),
    message: z.string(),
  }).optional(),
  pendingApprovals: z.array(z.object({
    approvalRequestId: z.string().min(1),
    taskId: z.string().min(1),
    toolCallId: z.string().min(1),
    summary: z.string(),
    risk: z.string(),
    status: z.string(),
    createdAt: z.string(),
  })),
  latestDurableAnswer: z.object({
    answerId: z.string().min(1),
    summary: z.string(),
    createdAt: z.string(),
  }).optional(),
  resumeAnchor: z.object({
    lastEventSeq: z.number().int().nonnegative(),
    narrativeRevision: z.number().int().nonnegative(),
  }).optional(),
}).strict();

const narrativeStateSchema = z.object({
  revision: z.number().int().nonnegative(),
  threadSummary: z.string(),
  taskSummaries: z.array(z.string()),
  openLoops: z.array(z.string()),
  notableEvents: z.array(z.string()),
  updatedAt: z.string(),
}).strict();

const workingSetWindowSchema = z.object({
  revision: z.number().int().nonnegative(),
  messages: z.array(z.string()),
  toolResults: z.array(z.string()),
  verifierFeedback: z.array(z.string()),
  retrievedMemories: z.array(z.string()),
  updatedAt: z.string(),
}).strict();

const threadViewUpdatedPayloadSchema = z.object({
  recoveryFacts: recoveryFactsSchema.optional(),
  narrativeState: narrativeStateSchema.optional(),
  workingSetWindow: workingSetWindowSchema.optional(),
  status: threadStatusSchema,
  threadId: z.string().min(1),
  summary: z.string().optional(),
  recommendationReason: z.string().optional(),
  approvals: z.array(approvalViewSchema).optional(),
  tasks: z.array(taskViewSchema).optional(),
  workspaceRoot: z.string().optional(),
  projectId: z.string().optional(),
  threads: z.array(sessionThreadSummarySchema).optional(),
}).strict();

const taskLifecyclePayloadSchema = z.object({
  taskId: z.string().min(1).optional(),
  threadId: z.string().min(1).optional(),
  summary: z.string().optional(),
  status: taskStatusSchema.optional(),
  blockingReason: taskBlockingReasonSchema.optional(),
  error: z.string().optional(),
}).strict();

const threadStartedPayloadSchema = z.object({
  threadId: z.string().min(1),
  workspaceRoot: z.string(),
  projectId: z.string(),
  revision: z.number().int().nonnegative(),
  status: threadStatusSchema,
  recommendationReason: z.string().optional(),
  narrativeSummary: z.string().optional(),
  narrativeRevision: z.number().int().nonnegative().optional(),
}).strict();

const threadInterruptedPayloadSchema = z.object({
  threadId: z.string().min(1),
  reason: z.string().optional(),
}).strict();

const threadBlockedPayloadSchema = z.object({
  threadId: z.string().min(1),
  status: threadStatusSchema,
  blockingReason: taskBlockingReasonSchema.optional(),
}).strict();

const toolEventPayloadSchema = z.object({
  summary: z.string(),
  output: z.unknown().optional(),
}).strict();

const modelStatusPayloadSchema = z.object({
  status: z.enum(["idle", "thinking", "responding"]),
}).strict();

const modelTimestampPayloadSchema = z.object({
  timestamp: z.number().int().nonnegative(),
}).strict();

const modelCompletedPayloadSchema = z.object({
  timestamp: z.number().int().nonnegative(),
  duration: z.number().int().nonnegative(),
  waitDuration: z.number().int().nonnegative(),
  genDuration: z.number().int().nonnegative(),
}).strict();

const modelFailedPayloadSchema = z.object({
  timestamp: z.number().int().nonnegative(),
  duration: z.number().int().nonnegative(),
  error: z.string(),
}).strict();

const streamThinkingStartedPayloadSchema = z.object({
  model: z.string(),
}).strict();

const streamThinkingChunkPayloadSchema = z.object({
  content: z.string(),
}).strict();

const streamToolCallStartedPayloadSchema = z.object({
  toolName: z.string(),
  toolCallId: z.string(),
  args: z.unknown(),
}).strict();

const streamToolCallCompletedPayloadSchema = z.object({
  toolName: z.string(),
  toolCallId: z.string(),
  result: z.unknown(),
  success: z.boolean(),
}).strict();

const streamTextChunkPayloadSchema = z.object({
  content: z.string(),
  index: z.number().int().nonnegative(),
}).strict();

const streamDonePayloadSchema = z.object({
  summary: z.string(),
  status: z.enum(["completed", "failed", "interrupted"]),
}).strict();

export const runtimeEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("thread.started"), payload: threadStartedPayloadSchema }),
  z.object({ type: z.literal("thread.interrupted"), payload: threadInterruptedPayloadSchema }),
  z.object({ type: z.literal("thread.blocked"), payload: threadBlockedPayloadSchema }),
  z.object({ type: z.literal("thread.view_updated"), payload: threadViewUpdatedPayloadSchema }),
  z.object({ type: z.literal("task.created"), payload: taskLifecyclePayloadSchema }),
  z.object({ type: z.literal("task.updated"), payload: taskLifecyclePayloadSchema }),
  z.object({ type: z.literal("task.started"), payload: taskLifecyclePayloadSchema }),
  z.object({ type: z.literal("task.completed"), payload: taskLifecyclePayloadSchema }),
  z.object({ type: z.literal("task.failed"), payload: taskLifecyclePayloadSchema }),
  z.object({ type: z.literal("tool.executed"), payload: toolEventPayloadSchema }),
  z.object({ type: z.literal("tool.failed"), payload: toolEventPayloadSchema }),
  z.object({ type: z.literal("model.status"), payload: modelStatusPayloadSchema }),
  z.object({ type: z.literal("model.invocation_started"), payload: modelTimestampPayloadSchema }),
  z.object({ type: z.literal("model.first_token_received"), payload: modelTimestampPayloadSchema }),
  z.object({ type: z.literal("model.completed"), payload: modelCompletedPayloadSchema }),
  z.object({ type: z.literal("model.failed"), payload: modelFailedPayloadSchema }),
  z.object({ type: z.literal("stream.thinking_started"), payload: streamThinkingStartedPayloadSchema }),
  z.object({ type: z.literal("stream.thinking_chunk"), payload: streamThinkingChunkPayloadSchema }),
  z.object({ type: z.literal("stream.tool_call_started"), payload: streamToolCallStartedPayloadSchema }),
  z.object({ type: z.literal("stream.tool_call_completed"), payload: streamToolCallCompletedPayloadSchema }),
  z.object({ type: z.literal("stream.text_chunk"), payload: streamTextChunkPayloadSchema }),
  z.object({ type: z.literal("stream.done"), payload: streamDonePayloadSchema }),
]);

export const runtimeEventEnvelopeSchema = z.object({
  protocolVersion: protocolVersionSchema,
  seq: z.number().int().nonnegative(),
  timestamp: z.string(),
  traceId: z.string().optional(),
  clientId: z.string().optional(),
  event: runtimeEventSchema,
});

export type RuntimeEvent = z.infer<typeof runtimeEventSchema>;
export type RuntimeEventEnvelope = z.infer<typeof runtimeEventEnvelopeSchema>;
