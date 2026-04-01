export type ToolCallStatus = "created" | "running" | "completed" | "failed" | "blocked";

export type ToolCall = {
  toolCallId: string;
  threadId: string;
  taskId: string;
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
    toolCallId: input.toolCallId,
    threadId: input.threadId,
    taskId: input.taskId,
    toolName: input.toolName,
    args: input.args ?? {},
    status: "created",
  };
}
