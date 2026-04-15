import { z } from "zod";

/** 能力标记：标识某个工作包依赖的具体能力或危险动作 */
export const workPackageCapabilityMarkerSchema = z.enum([
  "apply_patch.delete_file",
  "respond_only",
]);
export type WorkPackageCapabilityMarker = z.infer<typeof workPackageCapabilityMarkerSchema>;

/** 能力家族：跨场景归并 planner/approval/runtime 行为的高层语义标签 */
export const workPackageCapabilityFamilySchema = z.enum([
  "approval_gated_delete",
  "reject_replan_delete",
  "artifact_current_package",
  "interrupt_resume_recovery",
]);
export type WorkPackageCapabilityFamily = z.infer<typeof workPackageCapabilityFamilySchema>;

/** 重新规划提示：指导 planner 在 reject/replan 时避免走回同一路径 */
export const workPackageReplanHintSchema = z.enum([
  "avoid_same_capability_marker",
]);
export type WorkPackageReplanHint = z.infer<typeof workPackageReplanHintSchema>;

/** WorkPackage：planner 切分出的最小执行单元 */
export const workPackageSchema = z.object({
  id: z.string().min(1),
  objective: z.string().min(1),
  capabilityMarker: workPackageCapabilityMarkerSchema.optional(),
  capabilityFamily: workPackageCapabilityFamilySchema.optional(),
  requiresApproval: z.boolean().optional(),
  replanHint: workPackageReplanHintSchema.optional(),
  allowedTools: z.array(z.string().min(1)),
  inputRefs: z.array(z.string().min(1)),
  expectedArtifacts: z.array(z.string().min(1)),
});

export type WorkPackage = z.infer<typeof workPackageSchema>;
