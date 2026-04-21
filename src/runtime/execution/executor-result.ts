import { z } from "zod";

/** executor 工具名：模型只能请求 harness 已注册的稳定工具。 */
export const executorToolNameSchema = z.enum(["apply_patch", "exec", "read_file"]);

/** executor 工具调用：模型输出的结构化执行计划单元。 */
export const executorToolCallSchema = z.object({
  toolCallId: z.string().min(1),
  toolName: executorToolNameSchema,
  args: z.record(z.string(), z.unknown()).default({}),
  path: z.string().min(1).optional(),
  command: z.string().min(1).optional(),
  commandArgs: z.array(z.string()).optional(),
  cwd: z.string().min(1).optional(),
  timeoutMs: z.number().int().positive().optional(),
  action: z.enum(["modify_file", "create_file", "delete_file"]).optional(),
  changedFiles: z.number().int().nonnegative().optional(),
});

/** executor 输出：只承认结构化 toolCalls，不承认自然语言执行声明。 */
export const executorResultSchema = z.object({
  summary: z.string().min(1),
  toolCalls: z.array(executorToolCallSchema).default([]),
});

export type ExecutorToolCall = z.infer<typeof executorToolCallSchema>;
export type ExecutorResult = z.infer<typeof executorResultSchema>;
