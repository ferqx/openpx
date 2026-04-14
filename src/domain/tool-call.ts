/**
 * @module domain/tool-call
 * 工具调用（tool call）领域实体。
 *
 * ToolCall 表示一次对工具的具体调用，记录工具名、调用参数和执行状态。
 * 它挂载在 task（具体步骤）之下，是 run（执行尝试）执行过程中的
 * 最细粒度可追踪单元。
 *
 * ToolCall 的生命周期：created → running → completed/failed/blocked，
 * 其中 blocked 状态用于需要审批（approval）的工具调用。
 */
import { taskId as sharedTaskId, threadId as sharedThreadId, toolCallId as sharedToolCallId } from "../shared/ids";

/**
 * 工具调用状态：
 * - created——已创建，尚未开始执行
 * - running——正在执行
 * - completed——执行成功
 * - failed——执行失败
 * - blocked——被阻塞（等待审批）
 */
export type ToolCallStatus = "created" | "running" | "completed" | "failed" | "blocked";

/**
 * 工具调用——对一次工具调用的完整记录。
 * 挂载在 task 之下，是执行过程中的最细粒度可追踪单元。
 */
export type ToolCall = {
  /** toolCallId——工具调用唯一标识 */
  toolCallId: ReturnType<typeof sharedToolCallId>;
  /** threadId——所属协作线标识 */
  threadId: ReturnType<typeof sharedThreadId>;
  /** taskId——所属具体步骤标识 */
  taskId: ReturnType<typeof sharedTaskId>;
  /** toolName——工具名称，如 "shell"、"edit"、"read" */
  toolName: string;
  /** args——工具调用参数 */
  args: Record<string, unknown>;
  /** status——当前工具调用状态 */
  status: ToolCallStatus;
};

/**
 * 创建工具调用工厂函数。
 * 初始状态为 "created"，args 默认为空对象。
 */
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
