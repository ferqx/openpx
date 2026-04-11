import { z } from "zod";

export const workPackageCapabilityMarkerSchema = z.enum([
  "apply_patch.delete_file",
  "respond_only",
]);
export type WorkPackageCapabilityMarker = z.infer<typeof workPackageCapabilityMarkerSchema>;

export const workPackageCapabilityFamilySchema = z.enum([
  "approval_gated_delete",
  "reject_replan_delete",
  "artifact_current_package",
  "interrupt_resume_recovery",
]);
export type WorkPackageCapabilityFamily = z.infer<typeof workPackageCapabilityFamilySchema>;

export const workPackageReplanHintSchema = z.enum([
  "avoid_same_capability_marker",
]);
export type WorkPackageReplanHint = z.infer<typeof workPackageReplanHintSchema>;

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
