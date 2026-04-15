import { z } from "zod";
import { workerStatusSchema } from "../../../shared/schemas";

/** worker 角色白名单：planner/executor/verifier/memory_maintainer */
export const workerRoleSchema = z.enum(["planner", "executor", "verifier", "memory_maintainer"]);
export const workerViewStatusSchema = workerStatusSchema;

/** WorkerView：客户端可见的 worker 生命周期视图 */
export const workerViewSchema = z.object({
  workerId: z.string().min(1),
  threadId: z.string().min(1),
  taskId: z.string().min(1),
  role: workerRoleSchema,
  status: workerViewStatusSchema,
  spawnReason: z.string(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  resumeToken: z.string().optional(),
});

export type WorkerView = z.infer<typeof workerViewSchema>;
