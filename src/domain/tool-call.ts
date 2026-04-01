import { taskId as sharedTaskId, threadId as sharedThreadId, toolCallId as sharedToolCallId } from "../shared/ids";

export type ToolCallStatus = "created" | "running" | "completed" | "failed" | "blocked";

export type ToolCall = {
  toolCallId: ReturnType<typeof sharedToolCallId>;
  threadId: ReturnType<typeof sharedThreadId>;
  taskId: ReturnType<typeof sharedTaskId>;
  toolName: string;
  args: Record<string, unknown>;
  status: ToolCallStatus;
};

export function createToolCall(input: {
  toolCallId: string;
  threadId: string;
  taskId: string;
  toolName: string;
  args?: Record<string, unknown>;
}): ToolCall {
  return {
    toolCallId: sharedToolCallId(input.toolCallId),
    threadId: sharedThreadId(input.threadId),
    taskId: sharedTaskId(input.taskId),
    toolName: input.toolName,
    args: input.args ?? {},
    status: "created",
  };
}
