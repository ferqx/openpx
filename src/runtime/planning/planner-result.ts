import { z } from "zod";
import { workPackageSchema } from "./work-package";

/** PlanDecisionOption：plan mode 需要用户选择时的单个方案 */
export const planDecisionOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  continuation: z.string().min(1),
});

/** PlanDecisionRequest：planner 暂停执行前给 surface 的方案选择请求 */
export const planDecisionRequestSchema = z.object({
  question: z.string().min(1),
  sourceInput: z.string().min(1).optional(),
  options: z.array(planDecisionOptionSchema).min(2).max(4),
});

/** PlannerResult：planner 输出的结构化结果 */
export const plannerResultSchema = z.object({
  workPackages: z.array(workPackageSchema),
  acceptanceCriteria: z.array(z.string().min(1)),
  riskFlags: z.array(z.string().min(1)),
  approvalRequiredActions: z.array(z.string().min(1)),
  verificationScope: z.array(z.string().min(1)),
  decisionRequest: planDecisionRequestSchema.optional(),
});

export type PlannerResult = z.infer<typeof plannerResultSchema>;
export type PlanDecisionRequest = z.infer<typeof planDecisionRequestSchema>;
