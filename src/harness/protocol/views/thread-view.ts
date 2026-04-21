import { z } from "zod";
import { runStatusSchema, threadStatusSchema } from "../../../shared/schemas";
import { threadModeSchema } from "../../../control/agents/thread-mode";

/** 客户端可见的线程阻塞原因类别 */
export const blockingReasonKindSchema = z.enum(["waiting_approval", "plan_decision", "human_recovery"]);

/** ThreadView：客户端线程列表项的稳定视图 */
export const threadViewSchema = z.object({
  threadId: z.string().min(1),
  workspaceRoot: z.string(),
  projectId: z.string(),
  revision: z.number().int().nonnegative(),
  status: threadStatusSchema,
  threadMode: threadModeSchema,
  activeRunId: z.string().min(1).optional(),
  activeRunStatus: runStatusSchema.optional(),
  narrativeSummary: z.string().optional(),
  narrativeRevision: z.number().int().nonnegative().optional(),
  pendingApprovalCount: z.number().int().nonnegative().optional(),
  blockingReasonKind: blockingReasonKindSchema.optional(),
});

export type ThreadView = z.infer<typeof threadViewSchema>;
