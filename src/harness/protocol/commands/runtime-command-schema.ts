import { z } from "zod";
import { threadModeSchema } from "../../../control/agents/thread-mode";

/** runtime 命令协议：客户端发送给 runtime 的稳定命令面 */
export const runtimeCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("new_thread") }),
  z.object({ kind: z.literal("switch_thread"), threadId: z.string().min(1) }),
  z.object({ kind: z.literal("continue"), threadId: z.string().min(1).optional() }),
  z.object({ kind: z.literal("restart_run"), threadId: z.string().min(1) }),
  z.object({ kind: z.literal("resubmit_intent"), threadId: z.string().min(1), content: z.string() }),
  z.object({ kind: z.literal("abandon_run"), threadId: z.string().min(1) }),
  z.object({ kind: z.literal("interrupt"), threadId: z.string().min(1).optional() }),
  z.object({
    kind: z.literal("set_thread_mode"),
    threadId: z.string().min(1),
    mode: threadModeSchema,
    trigger: z.enum(["slash_command", "plain_input", "runtime_command", "compat_plan_task"]),
    reason: z.string().optional(),
  }),
  z.object({
    kind: z.literal("clear_thread_mode"),
    threadId: z.string().min(1),
    trigger: z.enum(["slash_command", "plain_input", "runtime_command", "compat_plan_task"]),
    reason: z.string().optional(),
  }),
  z.object({ kind: z.literal("add_task"), content: z.string(), background: z.boolean().optional() }),
  z.object({ kind: z.literal("plan_task"), content: z.string() }),
  z.object({
    kind: z.literal("worker_spawn"),
    threadId: z.string().min(1).optional(),
    taskId: z.string().min(1),
    role: z.enum(["planner", "executor", "verifier", "memory_maintainer"]),
    spawnReason: z.string().min(1),
    resumeToken: z.string().min(1).optional(),
  }),
  z.object({ kind: z.literal("worker_inspect"), workerId: z.string().min(1) }),
  z.object({ kind: z.literal("worker_resume"), workerId: z.string().min(1) }),
  z.object({ kind: z.literal("worker_cancel"), workerId: z.string().min(1) }),
  z.object({ kind: z.literal("worker_join"), workerId: z.string().min(1) }),
  z.object({
    kind: z.literal("resolve_approval"),
    approvalRequestId: z.string().min(1),
    decision: z.enum(["approved", "rejected"]),
    reason: z.string().optional(),
  }),
  z.object({
    kind: z.literal("resolve_plan_decision"),
    threadId: z.string().min(1),
    runId: z.string().min(1),
    optionId: z.string().min(1),
    optionLabel: z.string().min(1),
    input: z.string().min(1),
  }),
  z.object({ kind: z.literal("approve"), approvalRequestId: z.string().min(1) }),
  z.object({ kind: z.literal("reject"), approvalRequestId: z.string().min(1), reason: z.string().optional() }),
]);

export type RuntimeCommand = z.infer<typeof runtimeCommandSchema>;
